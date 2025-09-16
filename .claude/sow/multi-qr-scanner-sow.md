# Statement of Work (SOW)
## 複数QRコード同時認識Webアプリケーション開発

### 1. プロジェクト概要

#### 1.1 目的
iPhone Safari上で動作する、4つのQRコードを同時に認識・処理できるWebアプリケーションを開発する。最小構成でzxing-wasmの実用性を検証し、実機での動作を確認する。

#### 1.2 背景
- iOS Safariでの動作が必須要件
- 複数QRコードの同時認識が必要
- ngrok経由でのアクセスによる実機テストが必要
- 最小構成での実装により、技術検証を迅速に行う

### 2. 技術要件

#### 2.1 必須技術スタック
- **フレームワーク**: React (関数コンポーネント + Hooks)
- **言語**: TypeScript (型安全性確保)
- **QRライブラリ**: zxing-wasm (WebAssembly版、iOS Safari対応)
- **ビルドツール**: Vite (高速HMR、ESModules対応)
- **パッケージマネージャー**: pnpm (効率的な依存関係管理)
- **エディタ**: nano (軽量テキストエディタ)

#### 2.2 動作環境要件
- **必須ブラウザ**: iOS Safari (最新版)
- **推奨ブラウザ**: Chrome, Firefox, Edge (最新版)
- **通信要件**: HTTPS (カメラAPI使用のため必須)
- **トンネリング**: ngrok (ローカル開発環境の外部公開)

### 3. 機能要件

#### 3.1 コア機能
1. **カメラアクセス**
   - デバイスの背面カメラ優先取得
   - ユーザー操作起点でのカメラ権限リクエスト
   - iOS Safari特有の制約への対応

2. **QRコード認識**
   - 最大4つのQRコードを同時認識
   - リアルタイム処理（30FPS目標）
   - 認識成功時の視覚的フィードバック

3. **データ表示**
   - 認識したQRコードの内容をリアルタイム表示
   - 各QRコードの識別番号付与
   - タイムスタンプ記録

#### 3.2 UI/UX要件
- **レスポンシブデザイン**: モバイルファースト
- **最小UI**: スキャン開始/停止ボタンのみ
- **ビデオプレビュー**: 全画面表示対応
- **認識結果表示**: オーバーレイ形式

### 4. 技術的実装詳細

#### 4.1 zxing-wasm初期化戦略
```typescript
// WebAssemblyファイルの配信元を明示的に指定
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => {
      if (path.endsWith('.wasm')) {
        // CDN経由での配信（CORS対応済み）
        return `https://unpkg.com/zxing-wasm@2/dist/reader/${path}`;
      }
      return prefix + path;
    }
  },
  fireImmediately: true  // 事前ロードで初回認識を高速化
})
```

#### 4.2 iOS Safari対応実装
```typescript
// ビデオ要素の必須属性
<video
  ref={videoRef}
  autoPlay      // 自動再生
  muted         // 音声ミュート（自動再生に必須）
  playsInline   // インライン再生（全画面化防止）
  style={{ width: '100%', height: '100%' }}
/>

// カメラストリーム取得
navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment',  // 背面カメラ指定
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
})
```

#### 4.3 複数QR同時認識ロジック
```typescript
// Canvas経由でImageData取得
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

// 複数QRコード読み取り
const results = await readBarcodes(imageData, {
  formats: ['QRCode'],        // QRコードのみに限定
  maxNumberOfSymbols: 4,      // 最大4つまで認識
  tryHarder: true            // 認識精度向上
});
```

### 5. ファイル構成

```
multi-qr-scanner_2/
├── .claude/
│   └── sow/
│       └── multi-qr-scanner-sow.md (本書)
├── src/
│   ├── App.tsx           # メインコンポーネント
│   ├── App.css           # スタイルシート
│   ├── main.tsx          # エントリーポイント
│   └── vite-env.d.ts     # TypeScript型定義
├── public/
│   └── vite.svg          # アイコン
├── index.html            # HTMLテンプレート
├── package.json          # 依存関係定義
├── pnpm-lock.yaml        # ロックファイル
├── tsconfig.json         # TypeScript設定
├── vite.config.ts        # Vite設定
└── .gitignore           # Git除外設定
```

### 6. 開発フロー

#### 6.1 初期セットアップ
```bash
# プロジェクト作成
pnpm create vite@latest . --template react-ts

# 依存関係インストール
pnpm install
pnpm add zxing-wasm

# 開発サーバー起動（ホスト公開モード）
pnpm run dev --host 0.0.0.0
```

#### 6.2 ngrok設定
```bash
# トンネル開通
ngrok http 5173

# HTTPS URLをiPhoneで開く
# https://xxxx.ngrok.io
```

#### 6.3 デプロイメント
```bash
# プロダクションビルド
pnpm run build

# distフォルダを静的ホスティングへ
# (Vercel, Netlify, GitHub Pages等)
```

### 7. パフォーマンス目標

| 指標 | 目標値 | 備考 |
|------|--------|------|
| 初回読み込み時間 | < 3秒 | WASM含む |
| QR認識速度 | < 100ms | 単一QR |
| 複数QR認識速度 | < 200ms | 4つ同時 |
| フレームレート | 30 FPS | 安定動作 |
| メモリ使用量 | < 50MB | 継続動作時 |

### 8. エラーハンドリング

#### 8.1 想定エラーと対処
- **カメラ権限拒否**: 明確な権限要求UI表示
- **WASM読み込み失敗**: フォールバックCDN切り替え
- **非HTTPS環境**: 警告メッセージ表示
- **非対応ブラウザ**: 対応ブラウザ案内

#### 8.2 ログ収集
```typescript
// デバッグ情報の構造化ログ
console.log('[QR-Scanner]', {
  timestamp: new Date().toISOString(),
  event: 'scan_result',
  count: results.length,
  data: results.map(r => r.text)
});
```

### 9. テスト計画

#### 9.1 機能テスト
- [ ] iPhoneでカメラ起動確認
- [ ] 単一QRコード認識
- [ ] 4つのQRコード同時認識
- [ ] 認識結果の正確性検証
- [ ] スキャン開始/停止動作

#### 9.2 互換性テスト
- [ ] iOS Safari (必須)
- [ ] Chrome iOS
- [ ] Chrome Desktop
- [ ] Firefox Desktop
- [ ] Edge Desktop

#### 9.3 パフォーマンステスト
- [ ] 30秒連続スキャン
- [ ] メモリリーク確認
- [ ] バッテリー消費測定（実機）

### 10. リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| iOS Safariの制約 | 高 | 事前検証、代替実装準備 |
| WASM読み込み遅延 | 中 | CDN最適化、キャッシュ活用 |
| 複数QR認識精度 | 中 | tryHarder有効化、解像度調整 |
| バッテリー消費 | 低 | FPS制限、処理間隔調整 |

### 11. 今後の拡張可能性

- **データ永続化**: IndexedDB/LocalStorage
- **QRコード生成機能**: qrcode.js統合
- **バッチ処理**: CSV/JSON一括エクスポート
- **履歴管理**: スキャン履歴の保存・検索
- **PWA化**: オフライン対応、インストール可能化

### 12. 成果物

1. **ソースコード**: GitHubリポジトリ
2. **動作デモ**: ngrok/Vercelホスティング
3. **技術文書**: 実装詳細、API仕様
4. **テスト結果**: 動作確認レポート

### 13. スケジュール

| フェーズ | 期間 | 成果物 |
|----------|------|--------|
| 環境構築 | 30分 | 開発環境 |
| 基本実装 | 2時間 | カメラ表示、単一QR認識 |
| 複数QR対応 | 1時間 | 4つ同時認識 |
| iOS最適化 | 1時間 | Safari動作確認 |
| テスト | 30分 | 動作検証完了 |

### 14. 成功基準

- ✅ iPhone Safari実機で動作
- ✅ 4つのQRコードを同時認識
- ✅ ngrok経由でのアクセス可能
- ✅ 最小構成での実装完了
- ✅ 30FPSでの安定動作

---

**Document Version**: 1.0.0
**Last Updated**: 2025-09-15
**Author**: Development Team
**Status**: Draft