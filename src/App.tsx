import { useState, useRef, useEffect, useCallback } from 'react'
import { prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader'
import './App.css'

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

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))

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
        console.log('[QR-Scanner]', {
          timestamp: new Date().toISOString(),
          event: 'init_start',
          userAgent: navigator.userAgent
        })

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
        console.log('[QR-Scanner]', {
          timestamp: new Date().toISOString(),
          event: 'init_success'
        })
      } catch (err) {
        console.error('[QR-Scanner] Initialization error:', err)
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
      console.log('[QR-Scanner] Permission API not available:', err)
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
        console.log('[QR-Scanner]', {
          timestamp: new Date().toISOString(),
          event: 'camera_request',
          attempt: i + 1,
          isIOS,
          isSafari
        })

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        return stream
      } catch (error: unknown) {
        console.error('[QR-Scanner] Camera error:', error)
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

  // QRコードを追加（重複排除）
  const addQRCode = useCallback((text: string) => {
    const hash = btoa(encodeURIComponent(text)).replace(/=/g, '') // 簡易ハッシュ

    setUniqueResults(prev => {
      const newMap = new Map(prev)
      const now = new Date()

      if (newMap.has(hash)) {
        // 既存の場合は更新
        const existing = newMap.get(hash)!
        newMap.set(hash, {
          ...existing,
          lastSeen: now,
          count: existing.count + 1
        })
      } else {
        // 新規追加
        newMap.set(hash, {
          id: hash,
          text,
          firstSeen: now,
          lastSeen: now,
          count: 1
        })
      }

      return newMap
    })
  }, [])

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

    // Canvas設定
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('[QR-Scanner] Canvas size is 0')
      if (isScanning) {
        animationFrameRef.current = requestAnimationFrame(scanQRCodes)
      }
      return
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // 複数QRコード読み取り
      const scanResults = await readBarcodes(imageData, {
        formats: ['QRCode'],
        maxNumberOfSymbols: 4,
        tryHarder: true
      })

      if (scanResults.length > 0) {
        // 各QRコードをリストに追加
        scanResults.forEach((result: ReadResult) => {
          addQRCode(result.text)
        })

        console.log('[QR-Scanner]', {
          timestamp: new Date().toISOString(),
          event: 'scan_result',
          count: scanResults.length,
          data: scanResults.map(r => r.text)
        })
      }
    } catch (err) {
      console.error('[QR-Scanner] Scan error:', err)
    }

    if (isScanning) {
      // スキャン間隔を調整
      setTimeout(() => {
        if (isScanning) {
          animationFrameRef.current = requestAnimationFrame(scanQRCodes)
        }
      }, 100)
    }
  }, [isInitialized, isScanning, addQRCode])

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
      console.log('[QR-Scanner] Starting scan loop')

      // 少し遅延してからスキャン開始
      setTimeout(() => {
        scanQRCodes()
      }, 500)
    } catch (err) {
      console.error('[QR-Scanner] Start error:', err)
      setIsScanning(false)
    }
  }, [checkCameraPermission, requestCameraWithRetry, scanQRCodes])

  // スキャン停止（狩猟モード）
  const stopScanning = useCallback(() => {
    setIsScanning(false)

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

    console.log('[QR-Scanner]', {
      timestamp: new Date().toISOString(),
      event: 'scan_stop (hunting mode)'
    })
  }, [])

  // リストリセット
  const resetList = useCallback(() => {
    setUniqueResults(new Map())
    console.log('[QR-Scanner] List reset')
  }, [])

  // クリーンアップ
  useEffect(() => {
    return () => {
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
        <div className="video-wrapper">
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
            <div className="scanning-indicator">
              <span className="scanning-dot"></span>
              <span>スキャン中...</span>
            </div>
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