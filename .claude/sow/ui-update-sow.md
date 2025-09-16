# UI変更 Statement of Work (SOW)
## QRコードスキャナー ユーザビリティ改善

### 1. 変更概要

現在の複数QRコード同時認識機能を維持しながら、ユーザビリティとリスト管理機能を改善する。

### 2. 機能要件

#### 2.1 ボタン操作
- **「開始」ボタン**: スキャンを開始し、状態を「スキャン中」に変更
- **「狩猟」ボタン**: スキャンを停止し、状態を「スキャン停止中」に変更
- **「リセット」ボタン**: 収集したQRコードリストをクリア

#### 2.2 QRコードリスト管理
- **永続的リスト**: スキャン中に認識したQRコードを累積的に保存
- **重複排除**: 同一内容のQRコードは1つのみ表示
- **表示位置**: カメラプレビューの下部に配置
- **リスト保持**: スキャン停止後もリストを維持

### 3. 技術仕様

#### 3.1 状態管理
```typescript
interface UniqueQRResult {
  id: string;          // QR内容のハッシュ値
  text: string;        // QRコードの内容
  firstSeen: Date;     // 初回認識時刻
  lastSeen: Date;      // 最終認識時刻
  count: number;       // 認識回数
}

// 状態
const [scanningMode, setScanningMode] = useState<'idle' | 'scanning' | 'hunting'>('idle')
const [uniqueResults, setUniqueResults] = useState<Map<string, UniqueQRResult>>(new Map())
```

#### 3.2 重複排除ロジック
```typescript
function addQRCode(text: string) {
  const hash = btoa(text) // 簡易ハッシュ
  setUniqueResults(prev => {
    const newMap = new Map(prev)
    if (newMap.has(hash)) {
      // 既存の場合は更新
      const existing = newMap.get(hash)!
      newMap.set(hash, {
        ...existing,
        lastSeen: new Date(),
        count: existing.count + 1
      })
    } else {
      // 新規追加
      newMap.set(hash, {
        id: hash,
        text,
        firstSeen: new Date(),
        lastSeen: new Date(),
        count: 1
      })
    }
    return newMap
  })
}
```

### 4. UI/UXデザイン

#### 4.1 レイアウト構成
```
┌────────────────────────┐
│      ヘッダー          │
├────────────────────────┤
│                        │
│    カメラプレビュー    │
│                        │
├────────────────────────┤
│  [開始] [狩猟] [リセット] │
├────────────────────────┤
│    QRコードリスト      │
│    ・QR #1: xxxxx      │
│    ・QR #2: yyyyy      │
│    ・QR #3: zzzzz      │
└────────────────────────┘
```

#### 4.2 ボタンデザイン
- **開始ボタン**: 緑色、スキャン開始アイコン
- **狩猟ボタン**: オレンジ色、一時停止アイコン
- **リセットボタン**: 赤色、リセットアイコン

#### 4.3 リスト表示
- 各項目に認識回数バッジを表示
- 最新認識項目をハイライト
- スクロール可能なリスト

### 5. 実装手順

1. **状態管理の更新**
   - scanningModeステートの追加
   - uniqueResultsのMap構造実装

2. **ボタンコンポーネントの実装**
   - 3つのボタンを横並びに配置
   - 状態に応じた表示/非表示制御

3. **重複排除ロジック**
   - QRコード内容のハッシュ化
   - Mapを使用した効率的な重複チェック

4. **リスト表示コンポーネント**
   - 永続的なリスト表示
   - 認識回数とタイムスタンプ表示

5. **アニメーション**
   - 新規項目追加時のフェードイン
   - リセット時のフェードアウト

### 6. テスト項目

- [ ] 開始ボタンでスキャン開始
- [ ] 狩猟ボタンでスキャン停止
- [ ] リセットボタンでリストクリア
- [ ] 同一QRコードの重複排除
- [ ] リスト項目の永続表示
- [ ] 認識回数のカウントアップ
- [ ] スクロール可能なリスト

### 7. パフォーマンス考慮事項

- Map構造による O(1) の重複チェック
- 最大保存項目数の制限（100件）
- メモリ効率的なデータ構造

### 8. 成功基準

- ✅ 3つのボタンが正しく動作
- ✅ QRコードの重複が排除される
- ✅ リストが永続的に表示される
- ✅ リセット機能が動作
- ✅ iOS Safariで安定動作

---

**Document Version**: 1.0.0
**Last Updated**: 2025-09-15
**Status**: Approved for Implementation