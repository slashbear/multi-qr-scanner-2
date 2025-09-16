import { useState, useRef, useEffect, useCallback } from 'react'
import { prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader'
import GuideFrame, { type GuideState, calculateGuideSize, isQRInGuide } from './GuideFrame'
import './App.css'

// 定数定義
const SCAN_COOLDOWN_DURATION = 3000 // 同一QRコードのクールダウン時間（ミリ秒）
const SCAN_HISTORY_TTL = 10000 // スキャン履歴の保持時間（ミリ秒）
const MAX_RECENT_SCANS = 20 // 最近のスキャン履歴の最大件数
const MAX_UNIQUE_RESULTS = 50 // ユニーク結果の最大件数
const MEMORY_CLEANUP_INTERVAL = 30000 // メモリクリーンアップ間隔（ミリ秒）
const SCAN_INTERVAL_MIN = 100 // 最小スキャン間隔（ミリ秒）
const SCAN_INTERVAL_MAX = 500 // 最大スキャン間隔（ミリ秒）
const SCAN_INTERVAL_DEFAULT = 200 // デフォルトスキャン間隔（ミリ秒）
const CANVAS_SCALE = 0.6 // Canvas描画スケール
const GUIDE_TOLERANCE = 0.1 // ガイド領域の許容誤差
const READBARCODES_TIMEOUT = 1000 // readBarcodesのタイムアウト（ミリ秒）

// 開発環境チェック
const isDevelopment = process.env.NODE_ENV === 'development'

interface UniqueQRResult {
  id: string
  text: string
  firstSeen: Date
  lastSeen: Date
  count: number
}

function App() {
  const [isScanning, setIsScanning] = useState(false)
  const [uniqueResults, setUniqueResults] = useState<Map<string, UniqueQRResult>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | null>(null)
  const [guideState, setGuideState] = useState<GuideState>('waiting')
  const [lastScanTime, setLastScanTime] = useState<number>(0)
  const [scanInterval, setScanInterval] = useState<number>(SCAN_INTERVAL_DEFAULT) // 動的スキャン間隔
  const [focusGuideOnly, setFocusGuideOnly] = useState<boolean>(false) // ガイド領域のみスキャン
  const [recentScans, setRecentScans] = useState<Map<string, number>>(new Map()) // 最近のスキャン履歴（クールダウン用）

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const videoWrapperRef = useRef<HTMLDivElement>(null)
  const performanceRef = useRef<{ lastFrameTime: number; frameCount: number }>({
    lastFrameTime: 0,
    frameCount: 0
  })

  // WebAssembly対応チェック
  useEffect(() => {
    if (!WebAssembly) {
      setError('WebAssemblyがサポートされていません')
      return
    }
  }, [])

  // デバイス判定
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

  // zxing-wasm初期化
  useEffect(() => {
    const initializeZXing = async () => {
      try {
        if (isDevelopment) {
          console.log('[QR-Scanner]', {
            timestamp: new Date().toISOString(),
            event: 'init_start',
            userAgent: navigator.userAgent
          })
        }

        await prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) => {
              if (path.endsWith('.wasm')) {
                const cdns = [
                  'https://unpkg.com/zxing-wasm@2/dist/reader/',
                  'https://fastly.jsdelivr.net/npm/zxing-wasm@2/dist/reader/'
                ]
                return cdns[0] + path
              }
              return prefix + path
            }
          },
          fireImmediately: true
        })

        setIsInitialized(true)
        if (isDevelopment) {
          console.log('[QR-Scanner]', {
            timestamp: new Date().toISOString(),
            event: 'init_success'
          })
        }
      } catch (err) {
        if (isDevelopment) {
          console.error('[QR-Scanner] Initialization error:', err)
        }
        setError('QRスキャナーの初期化に失敗しました')
      }
    }

    initializeZXing()
  }, [])

  // カメラ権限チェック
  const checkCameraPermission = useCallback(async () => {
    try {
      if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
        setPermissionStatus(result.state as 'prompt' | 'granted' | 'denied')
        return result.state
      }
    } catch (err) {
      if (isDevelopment) {
        console.log('[QR-Scanner] Permission API not available:', err)
      }
    }
    return 'prompt'
  }, [])

  // カメラストリーム取得（リトライ付き）
  const requestCameraWithRetry = useCallback(async (maxRetries = 2) => {
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    }

    for (let i = 0; i <= maxRetries; i++) {
      try {
        if (isDevelopment) {
          console.log('[QR-Scanner]', {
            timestamp: new Date().toISOString(),
            event: 'camera_request',
            attempt: i + 1,
            isIOS,
            isSafari
          })
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        return stream
      } catch (error: unknown) {
        if (isDevelopment) {
          console.error('[QR-Scanner] Camera error:', error)
        }
        const err = error as { name?: string; message?: string }

        // iOS SafariのAbortError対策
        if (err.name === 'AbortError' && i < maxRetries && isIOS) {
          await new Promise(r => setTimeout(r, 500))
          continue
        }

        if (err.name === 'NotAllowedError') {
          setError('カメラのアクセス許可が必要です')
          setPermissionStatus('denied')
        } else if (err.name === 'NotFoundError') {
          setError('カメラが見つかりません')
        } else if (err.name === 'NotReadableError') {
          setError('カメラは他のアプリで使用中です')
        } else {
          setError(`カメラエラー: ${err.message || '不明なエラー'}`)
        }

        throw error
      }
    }
    return null
  }, [isIOS, isSafari])

  // QRコードを追加（重複排除とクールダウン）
  const addQRCode = useCallback((text: string) => {
    const hash = btoa(encodeURIComponent(text)).replace(/=/g, '') // 簡易ハッシュ
    const now = Date.now()

    // 同一QRコードのクールダウンチェック
    const lastScanTime = recentScans.get(hash)
    if (lastScanTime && now - lastScanTime < SCAN_COOLDOWN_DURATION) {
      return false // クールダウン中はスキップ
    }

    // 最近のスキャン履歴を更新
    setRecentScans(prev => {
      const newMap = new Map(prev)

      // 古いエントリを削除
      for (const [key, time] of newMap.entries()) {
        if (now - time > SCAN_HISTORY_TTL) {
          newMap.delete(key)
        }
      }

      // 新しいスキャンを記録
      newMap.set(hash, now)

      // メモリ制限
      if (newMap.size > MAX_RECENT_SCANS) {
        const oldestKey = Array.from(newMap.entries())
          .sort((a, b) => a[1] - b[1])[0][0]
        newMap.delete(oldestKey)
      }

      return newMap
    })

    setUniqueResults(prev => {
      const newMap = new Map(prev)
      const nowDate = new Date()

      if (newMap.has(hash)) {
        // 既存の場合は更新（カウントの増加を抑制）
        const existing = newMap.get(hash)!
        newMap.set(hash, {
          ...existing,
          lastSeen: nowDate,
          count: existing.count + 1
        })
      } else {
        // 新規追加
        newMap.set(hash, {
          id: hash,
          text,
          firstSeen: nowDate,
          lastSeen: nowDate,
          count: 1
        })
      }

      // メモリ制限
      if (newMap.size > MAX_UNIQUE_RESULTS) {
        const entries = Array.from(newMap.entries())
          .sort((a, b) => b[1].lastSeen.getTime() - a[1].lastSeen.getTime())
        const limitedMap = new Map(entries.slice(0, MAX_UNIQUE_RESULTS))
        return limitedMap
      }

      return newMap
    })

    return true // 追加成功
  }, [recentScans])

  // スキャン処理
  const scanQRCodes = useCallback(async () => {
    if (!videoRef.current || !isInitialized || !isScanning) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      if (isScanning) {
        animationFrameRef.current = requestAnimationFrame(scanQRCodes)
      }
      return
    }

    // Canvas設定（解像度を下げてパフォーマンス向上）
    canvas.width = Math.floor(video.videoWidth * CANVAS_SCALE)
    canvas.height = Math.floor(video.videoHeight * CANVAS_SCALE)

    if (canvas.width === 0 || canvas.height === 0) {
      if (isDevelopment) {
        console.warn('[QR-Scanner] Canvas size is 0')
      }
      if (isScanning) {
        animationFrameRef.current = requestAnimationFrame(scanQRCodes)
      }
      return
    }

    // パフォーマンス測定（Safari対応）
    const startTime = typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()

    // ガイド領域のみスキャンする場合の最適化
    if (focusGuideOnly && videoWrapperRef.current) {
      const guideRegion = calculateGuideSize(
        videoWrapperRef.current.clientWidth,
        videoWrapperRef.current.clientHeight
      )

      // ビデオ座標系に変換
      const videoScale = {
        x: video.videoWidth / videoWrapperRef.current.clientWidth,
        y: video.videoHeight / videoWrapperRef.current.clientHeight
      }

      const cropX = Math.floor(guideRegion.left * videoScale.x * CANVAS_SCALE)
      const cropY = Math.floor(guideRegion.top * videoScale.y * CANVAS_SCALE)
      const cropWidth = Math.floor(guideRegion.width * videoScale.x * CANVAS_SCALE)
      const cropHeight = Math.floor(guideRegion.height * videoScale.y * CANVAS_SCALE)

      // ガイド領域のみを描画
      ctx.drawImage(
        video,
        guideRegion.left * videoScale.x,
        guideRegion.top * videoScale.y,
        guideRegion.width * videoScale.x,
        guideRegion.height * videoScale.y,
        0, 0, canvas.width, canvas.height
      )
    } else {
      // videoWrapperRefがない場合のフォールバックとログ
      if (focusGuideOnly && !videoWrapperRef.current && isDevelopment) {
        console.warn('[QR-Scanner] Guide-only mode requires videoWrapperRef')
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // 複数QRコード読み取り（タイムアウト付き）
      const scanPromise = readBarcodes(imageData, {
        formats: ['QRCode'],
        maxNumberOfSymbols: 2,  // 4→2に削減で処理速度向上
        tryHarder: false        // true→falseで処理速度優先
      })

      // タイムアウト処理
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('readBarcodes timeout')), READBARCODES_TIMEOUT)
      })

      const scanResults = await Promise.race([scanPromise, timeoutPromise]) as ReadResult[]

      if (scanResults.length > 0) {
        // ガイド領域の計算
        const guideRegion = videoWrapperRef.current
          ? calculateGuideSize(
              videoWrapperRef.current.clientWidth,
              videoWrapperRef.current.clientHeight
            )
          : null

        // QRコードを領域内外で分類
        const inGuideResults: ReadResult[] = []
        const outGuideResults: ReadResult[] = []

        scanResults.forEach((result: ReadResult) => {
          if (guideRegion && result.position) {
            // Calculate QR bounds in video coordinates
            const videoScale = {
              x: video.videoWidth / videoWrapperRef.current!.clientWidth,
              y: video.videoHeight / videoWrapperRef.current!.clientHeight
            }

            // Get QR center position
            const points = result.position
            const centerX = (points.topLeft.x + points.topRight.x + points.bottomLeft.x + points.bottomRight.x) / 4
            const centerY = (points.topLeft.y + points.topRight.y + points.bottomLeft.y + points.bottomRight.y) / 4

            // Convert to display coordinates
            const displayBounds = {
              x: centerX / videoScale.x,
              y: centerY / videoScale.y,
              width: Math.abs(points.topRight.x - points.topLeft.x) / videoScale.x,
              height: Math.abs(points.bottomLeft.y - points.topLeft.y) / videoScale.y
            }

            if (isQRInGuide(displayBounds, guideRegion)) {
              inGuideResults.push(result)
            } else {
              outGuideResults.push(result)
            }
          } else {
            outGuideResults.push(result)
          }
        })

        // 領域内を優先して処理
        const now = Date.now()
        let hasNewDetection = false

        if (inGuideResults.length > 0) {
          // 新規検出があるかチェック
          for (const result of inGuideResults) {
            if (addQRCode(result.text)) {
              hasNewDetection = true
            }
          }

          if (hasNewDetection) {
            setGuideState('success')
            setTimeout(() => setGuideState('scanning'), 300)
            setLastScanTime(now)

            // 成功時はスキャン間隔を長くする
            setScanInterval(SCAN_INTERVAL_MAX)
            setTimeout(() => setScanInterval(SCAN_INTERVAL_DEFAULT), 2000) // 2秒後に戻す
          }
        } else if (outGuideResults.length > 0 && now - lastScanTime > 1000) {
          // 領域外は1秒のクールダウン後に処理
          for (const result of outGuideResults) {
            addQRCode(result.text)
          }
        }

        if (isDevelopment) {
          console.log('[QR-Scanner]', {
            timestamp: new Date().toISOString(),
            event: 'scan_result',
            inGuide: inGuideResults.length,
            outGuide: outGuideResults.length,
            data: scanResults.map(r => r.text)
          })
        }
      } else {
        // QRコードが見つからない場合
        if (guideState === 'success') {
          setGuideState('scanning')
        }
      }
    } catch (err) {
      if (isDevelopment) {
        console.error('[QR-Scanner] Scan error:', err)
      }
      // タイムアウトエラーの場合は特別な処理
      if (err instanceof Error && err.message === 'readBarcodes timeout') {
        if (isDevelopment) {
          console.warn('[QR-Scanner] Scan timeout, retrying...')
        }
        // タイムアウトの場合はエラー状態にしない
      } else {
        setGuideState('error')
        setTimeout(() => setGuideState('scanning'), 1000)
      }
    }

    // パフォーマンス計測（Safari対応）
    const endTime = typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()
    const processingTime = endTime - startTime

    // FPS計算
    performanceRef.current.frameCount++
    if (endTime - performanceRef.current.lastFrameTime > 1000) {
      if (isDevelopment) {
        console.log('[QR-Scanner Performance]', {
          fps: performanceRef.current.frameCount,
          avgProcessingTime: `${processingTime.toFixed(2)}ms`,
          scanInterval: `${scanInterval}ms`
        })
      }
      performanceRef.current.frameCount = 0
      performanceRef.current.lastFrameTime = endTime
    }

    // 処理時間に応じて動的にスキャン間隔を調整
    if (processingTime > 100) {
      setScanInterval(prev => Math.min(prev + 50, SCAN_INTERVAL_MAX))
    } else if (processingTime < 50) {
      setScanInterval(prev => Math.max(prev - 25, SCAN_INTERVAL_MIN))
    }

    if (isScanning) {
      // 動的スキャン間隔を使用
      setTimeout(() => {
        if (isScanning) {
          animationFrameRef.current = requestAnimationFrame(scanQRCodes)
        }
      }, scanInterval)
    }
  }, [isInitialized, isScanning, addQRCode, guideState, lastScanTime, scanInterval, focusGuideOnly, recentScans])

  // スキャン開始
  const startScanning = useCallback(async () => {
    try {
      setError(null)

      // カメラ権限チェック
      const permission = await checkCameraPermission()
      if (permission === 'denied') {
        setError('カメラのアクセス許可が拒否されています。ブラウザの設定から許可してください。')
        return
      }

      // カメラストリーム取得
      const stream = await requestCameraWithRetry()
      if (!stream) {
        throw new Error('カメラストリームの取得に失敗しました')
      }
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setIsScanning(true)
      setGuideState('scanning')
      if (isDevelopment) {
        console.log('[QR-Scanner] Starting scan loop')
      }

      // 少し遅延してからスキャン開始
      setTimeout(() => {
        scanQRCodes()
      }, 500)
    } catch (err) {
      if (isDevelopment) {
        console.error('[QR-Scanner] Start error:', err)
      }
      setIsScanning(false)
    }
  }, [checkCameraPermission, requestCameraWithRetry, scanQRCodes])

  // スキャン停止（狩猟モード）
  const stopScanning = useCallback(() => {
    setIsScanning(false)
    setGuideState('waiting')

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    if (isDevelopment) {
      console.log('[QR-Scanner]', {
        timestamp: new Date().toISOString(),
        event: 'scan_stop (hunting mode)'
      })
    }
  }, [])

  // リストリセット
  const resetList = useCallback(() => {
    setUniqueResults(new Map())
    setRecentScans(new Map())
    if (isDevelopment) {
      console.log('[QR-Scanner] List reset')
    }
  }, [])

  // クリーンアップとメモリ管理
  useEffect(() => {
    // 定期的なメモリクリーンアップ
    const cleanupInterval = setInterval(() => {
      const now = Date.now()

      // 古いスキャン履歴を削除
      setRecentScans(prev => {
        const newMap = new Map()
        for (const [key, time] of prev.entries()) {
          if (now - time < SCAN_HISTORY_TTL) { // TTL以内のものだけ保持
            newMap.set(key, time)
          }
        }
        return newMap
      })

      if (isDevelopment) {
        console.log('[QR-Scanner] Memory cleanup performed')
      }
    }, MEMORY_CLEANUP_INTERVAL)

    return () => {
      clearInterval(cleanupInterval)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // HTTPS警告
  useEffect(() => {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      setError('HTTPS接続が必要です。カメラAPIを使用するにはHTTPS経由でアクセスしてください。')
    }
  }, [])

  // スキャン状態が変更されたらスキャンループを開始
  useEffect(() => {
    if (isScanning && isInitialized) {
      scanQRCodes()
    }
  }, [isScanning, isInitialized, scanQRCodes])

  // リストをArrayに変換
  const resultsList = Array.from(uniqueResults.values()).sort((a, b) =>
    b.lastSeen.getTime() - a.lastSeen.getTime()
  )

  return (
    <div className="app">
      <div className="header">
        <h1>QRコードスキャナー</h1>
        <p className="subtitle">
          {isScanning ? 'スキャン中' : 'スキャン停止中'} |
          収集済み: {uniqueResults.size}個
        </p>
      </div>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
        </div>
      )}

      {permissionStatus === 'denied' && (
        <div className="permission-denied">
          <p>カメラへのアクセスが拒否されています</p>
          <p>ブラウザの設定からカメラの権限を許可してください</p>
        </div>
      )}

      <div className="scanner-container">
        <div className="video-wrapper" ref={videoWrapperRef}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="video-preview"
            style={{ display: isScanning || streamRef.current ? 'block' : 'none' }}
          />

          {!isScanning && !streamRef.current && (
            <div className="placeholder">
              <div className="placeholder-icon">📷</div>
              <p>「開始」をタップしてスキャンを開始</p>
            </div>
          )}

          {isScanning && (
            <>
              <GuideFrame state={guideState} containerRef={videoWrapperRef} />
              <div className="scanning-indicator">
                <span className="scanning-dot"></span>
                <span>スキャン中...</span>
              </div>
            </>
          )}
        </div>

        <div className="controls">
          {!isScanning ? (
            <button
              onClick={startScanning}
              disabled={!isInitialized}
              className="scan-button start"
            >
              {!isInitialized ? '初期化中...' : '開始'}
            </button>
          ) : (
            <button
              onClick={stopScanning}
              className="scan-button hunting"
            >
              停止
            </button>
          )}

          <button
            onClick={resetList}
            className="scan-button reset"
            disabled={uniqueResults.size === 0}
          >
            リセット
          </button>

          <button
            onClick={() => setFocusGuideOnly(!focusGuideOnly)}
            className={`scan-button ${focusGuideOnly ? 'guide-only' : 'full-scan'}`}
            title="ガイド領域のみスキャン/全画面スキャン切り替え"
          >
            {focusGuideOnly ? 'ガイドのみ' : '全画面'}
          </button>
        </div>

        {resultsList.length > 0 && (
          <div className="results">
            <h2>収集したQRコード（{resultsList.length}個）</h2>
            <div className="results-list">
              {resultsList.map((result) => (
                <div key={result.id} className="result-item">
                  <div className="result-header">
                    <span className="result-index">
                      QR #{resultsList.indexOf(result) + 1}
                    </span>
                    {result.count > 1 && (
                      <span className="result-count">×{result.count}</span>
                    )}
                    <span className="result-time">
                      {result.lastSeen.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="result-content">{result.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="footer">
        <div className="status">
          <span className={`status-dot ${isInitialized ? 'ready' : 'loading'}`}></span>
          <span>
            {isInitialized ? '準備完了' : '初期化中'} |
            {isIOS ? ' iOS' : ''} {isSafari ? ' Safari' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

export default App