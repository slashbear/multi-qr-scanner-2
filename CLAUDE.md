# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MUST Rules

The following rules MUST be followed:

1. **Language for Thinking and Output**
   - Think in English, output in Japanese

2. **SOW (Statement of Work) Storage Location**
   - SOW documents MUST be saved in the `.claude/sow/` directory

3. **Library Documentation Reference**
   - When looking up library usage, MUST use context7 to reference documentation

4. **Parallel Task Execution**
   - Break down tasks as much as possible and execute them in parallel
   - Send multiple tool calls in a single message for parallel execution

## Essential Commands

### Development
- `pnpm run dev` - Start the Vite development server (runs on port 5173)
- `pnpm install` - Install dependencies

### Build & Quality
- `pnpm run build` - TypeScript check and Vite production build
- `pnpm run lint` - Run ESLint on all files
- `pnpm run preview` - Preview production build locally

### Testing with HTTPS (Required for Camera Access)
- Use ngrok to tunnel local dev server: `ngrok http 5173`
- Access via the generated HTTPS URL for camera permissions

## Architecture Overview

This is a QR code scanner web application built with React, TypeScript, and Vite, designed specifically for iOS Safari compatibility. The application uses zxing-wasm for QR code recognition and supports simultaneous scanning of multiple QR codes.

### Core Components

**App.tsx** - Main application component that:
- Manages camera permissions and stream initialization
- Implements QR code scanning using zxing-wasm
- Handles multiple QR code detection with deduplication logic
- Manages scanning state, performance monitoring, and memory cleanup
- Implements iOS-specific workarounds (playsInline, muted video attributes)

**GuideFrame.tsx** - Visual guide overlay component that:
- Provides visual feedback for QR code positioning
- Tracks QR code location relative to guide boundaries
- Implements different states (empty, partial, focused, locked)
- Calculates optimal guide dimensions based on viewport

### Key Technical Considerations

**iOS Safari Compatibility**
- Video element must have `autoPlay`, `muted`, and `playsInline` attributes
- Camera permissions must be triggered by user interaction
- HTTPS is required for camera access (use ngrok for local testing)

**QR Code Scanning Implementation**
- Uses zxing-wasm with WebAssembly for performance
- Canvas-based frame capture at configurable intervals (50-500ms)
- Supports multiple QR codes with unique result tracking
- Implements scan cooldown to prevent duplicate detections

**Performance Optimizations**
- Configurable scan intervals based on performance metrics
- Memory cleanup for old scan results (5-minute TTL)
- Maximum limits on unique results (100) and recent scans (50)
- Canvas scaling for optimal processing performance

**State Management**
- React hooks for local state management
- No external state management libraries
- Refs for DOM elements and performance tracking

## Project-Specific Patterns

- All QR code processing happens client-side using WebAssembly
- Guide frame provides visual UX for optimal QR positioning
- Japanese UI text indicates target market
- Focus on mobile-first, specifically iOS Safari optimization
- Minimal external dependencies for lightweight deployment