import { useEffect, useState, useRef } from 'react'
import './GuideFrame.css'

export type GuideState = 'waiting' | 'scanning' | 'success' | 'error'

interface GuideFrameProps {
  state: GuideState
  containerRef: React.RefObject<HTMLDivElement>
}

interface GuideFrameConfig {
  baseRatio: { width: number; height: number }
  screenCoverage: number
  minWidth: number
  maxWidth: number
  padding: number
}

interface GuideRegion {
  top: number
  left: number
  width: number
  height: number
  center: { x: number; y: number }
}

const config: GuideFrameConfig = {
  baseRatio: { width: 252, height: 352 },
  screenCoverage: 0.6,
  minWidth: 200,
  maxWidth: 400,
  padding: 20
}

export function calculateGuideSize(containerWidth: number, containerHeight: number): GuideRegion {
  const ratio = config.baseRatio.height / config.baseRatio.width

  // Calculate size based on screen coverage
  let width = containerWidth * config.screenCoverage
  let height = width * ratio

  // Check if height exceeds container
  if (height > containerHeight * config.screenCoverage) {
    height = containerHeight * config.screenCoverage
    width = height / ratio
  }

  // Apply min/max constraints
  width = Math.max(config.minWidth, Math.min(config.maxWidth, width))
  height = width * ratio

  // Calculate position (centered)
  const left = (containerWidth - width) / 2
  const top = (containerHeight - height) / 2

  return {
    top,
    left,
    width,
    height,
    center: { x: left + width / 2, y: top + height / 2 }
  }
}

export function isQRInGuide(
  qrBounds: { x: number; y: number; width: number; height: number },
  guide: GuideRegion
): boolean {
  const qrCenter = {
    x: qrBounds.x + qrBounds.width / 2,
    y: qrBounds.y + qrBounds.height / 2
  }

  const tolerance = guide.width * 0.1
  return (
    qrCenter.x >= guide.left - tolerance &&
    qrCenter.x <= guide.left + guide.width + tolerance &&
    qrCenter.y >= guide.top - tolerance &&
    qrCenter.y <= guide.top + guide.height + tolerance
  )
}

function GuideFrame({ state, containerRef }: GuideFrameProps) {
  const [dimensions, setDimensions] = useState<GuideRegion | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  // Calculate dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const newDimensions = calculateGuideSize(rect.width, rect.height)
      setDimensions(newDimensions)
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)

    // Handle orientation change for mobile devices
    window.addEventListener('orientationchange', () => {
      setTimeout(updateDimensions, 100)
    })

    return () => {
      window.removeEventListener('resize', updateDimensions)
      window.removeEventListener('orientationchange', updateDimensions)
    }
  }, [containerRef])

  const getStateMessage = () => {
    switch (state) {
      case 'waiting':
        return 'カードをここに合わせる'
      case 'scanning':
        return 'スキャン中...'
      case 'success':
        return '認識しました！'
      case 'error':
        return '認識できません'
      default:
        return ''
    }
  }

  if (!dimensions) return null

  return (
    <div
      ref={frameRef}
      className={`guide-frame guide-frame--${state}`}
      style={{
        top: dimensions.top,
        left: dimensions.left,
        width: dimensions.width,
        height: dimensions.height
      }}
    >
      {/* Corner markers */}
      <div className="corner-marker corner-tl" />
      <div className="corner-marker corner-tr" />
      <div className="corner-marker corner-bl" />
      <div className="corner-marker corner-br" />

      {/* Center message */}
      <div className="guide-message">
        <span>{getStateMessage()}</span>
      </div>
    </div>
  )
}

export default GuideFrame