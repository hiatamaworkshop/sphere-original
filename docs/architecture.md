Architecture Definition　1/29

#important
This system is NOT an intelligent knowledge base.
It is a deterministic Metabolism System.

Inside the core:
- No reasoning
- No optimization
- No interpretation
- No meaning creation

All intelligence lives OUTSIDE the Sphere.
The core only applies physical laws.

Taboos:
- Do NOT introduce heuristics.
- Do NOT add adaptive logic.
- Do NOT rank, score, or judge meaning.
- Do NOT read or modify payload content.
- Do NOT merge nodes semantically.

#end


SphereProject – Core System (Genesis Spec, Revised)
0. プロジェクトの宣誓（Core Mission）

本システムは「情報の保管庫」ではない。
情報の 誕生・死・再配置 を司る 代謝系（Metabolism System） である。

すべての実装は、以下の 三つの摂理 に従わなければならない。

「死」がデフォルトである
外部からの供給が止まった情報は、時間の経過とともに必ず蒸発（Evaporation）する。
永続は例外であり、意志的に選ばれた結果である。

「局所」は全体に奉仕する
特定座標における過密・高熱は自動的に冷却され、
そのエネルギーは未踏領域・低密度領域へと再分配される。

「知能」は外部にある
Sphere 内部は 非知性的・決定論的 な物理法則（RenalCore）のみで構成される。
推論・解釈・意味生成は、すべて外部エージェントの責務である。

1. 禁止事項と用語法（The Taboos）

Sphere 内部実装において、一般的 IT 用語の使用を原則として避ける。
概念は 世界観に対応した語彙 で表現されなければならない。

一般用語	Sphere 用語	概念
User / Account	Agent / Diver	権限を持たない一時的潜行者
API / Request	Pulse / Osmosis	境界膜を通過する圧力・振動
Database	ReferenceDB / ProjectionDB	原典の墓床 / 現象の表層
Cache	Heat Reservoir	揮発的熱量の貯留
Delete / Purge	Evaporation / Decomposition	自然減衰 / 代謝分解
Admin / Manager	RenalCore / Glazier	恒常性維持器官 / 調律者
2. 技術的制約（Implementation Constraints）
2.1 言語・構造制約

POD 原則
class 禁止。
データは type / interface、ロジックは 純粋関数 のみ。

Rust 移植前提
可変参照・副作用・暗黙状態を持ち込まない。

2.2 二重記憶構造（Dual Layer Memory）
ReferenceDB（Cold）

原典・一次情報

不変・追記型

UUID と最小限の系譜のみ

例：SQLite / File

ProjectionDB（Hot）

座標・熱量・Ghost・Flow

揮発・代謝対象

例：Redis / VectorDB / Memory

重要
Reference は保存されるが、解釈されない。
Projection は解釈されるが、保存されない。

2.3 Decoupled Intelligence

Sphere 内部で LLM を実行しない

Embedding / 変換は Parser に隔離

RenalCore は数値と状態遷移のみを扱う

3. モジュール構成（System Components）
3.1 Parser / Tagger / Packer / Bookkeeper

Parser
外部入力を Embedding モデルにより 座標ベクトル化 する。

Tagger
エージェントが選別したタグを制限付きで統合し、
単一の Tag Vector を生成する。

Packer
Experience Capsule を分解し、
Reference（魂）と Projection（現象）へ振り分ける。

Bookkeeper
永続化の可否、重み付け、寿命を決定し
各 Repository に処理を委譲する。

3.2 RenalCore（The Organ）

Sphere の恒常性を維持する 非知性的エンジン。

Tick

世界の心拍。
一定間隔で以下を適用する。

Dynamic Decay
すべての Projection Node の熱量・TTL を減衰。

ttl_new = ttl_current − (α × LoadFactor)


Ascension / Erosion

Active → Amber（結晶化）

Amber → Fossil（風化）

Ghost / Plankton の浄化・吸収

Purification
Amber 定着時、周辺 Ghost を連鎖的に分解。

RenalCore は payload を読まない・変更しない。

3.3 Gatekeeper（The Warden）

境界帯（Periphery）に存在する検疫機構。

形式・速度・密度・サイズの検証

不正 Capsule の遮断

Sphere 内部の物理法則を汚さないための防波堤

4. データモデル定義（Archetypes）
type NodeKind =
  | "relic"
  | "active"
  | "amber"
  | "link"
  | "fossil"
  | "ghost"
  | "plankton"
  | "environment";

/**
 * Projection Field 上の実体
 */
interface SphereNode {
  id: string;           // Reference UUID
  kind: NodeKind;
  vector: number[];     // 1536-dim
  timestamp: number;

  metrics: {
    w: number;          // Weight
    d: number;          // Decay rate
    h: number;          // Heat
    ttl: number;        // Time To Live
    flg: number;        // 16bit 評価プロファイル
  };

  payload?: {
    summary?: string;   // Active / Amber のみ
    tags?: string[];
    links?: string[];
    ref_url?: string;
    traces?: number[][]; // Ghost 専用
    parent_active_id?: string;
  };
}

5. 実装フェーズ（Roadmap）
Phase 1：Schemas & Archetypes

型定義のみ

ロジック完全禁止

Phase 2：Metabolism

Tick / Decay / Ascension / Erosion

「放置すると死ぬ世界」

Phase 3：Incarnation

Packer / Bookkeeper

二重DBへの受肉

Phase 4：Circulation

Flow / Pulse / Density

観測と環境調整

実装力学：Repository & Controller
Controller（調律層）

Gatekeeper 通過後の Capsule を受理

受肉ワークフローの制御のみ

実装例：incarnation.controller.ts

Repository（記帳層）

Reference Repository：魂の刻印

Projection Repository：現象の投射

Bookkeeper の判断にのみ従う



書き込み禁止原則（Inviolable Rules）

Node.payload は 生成時以外書き換え不可

RenalCore は payload を 読まない

評価は 状態遷移のみ

新しい意味を作らない

行うのは：

消す

圧縮する

種別を変える

最終宣言

Reference は真実であり、触れてはならない。
Projection は現象であり、燃やしてよい。

この分離を破る実装は、
Sphere の思想そのものを破壊する。


1. 座標は「仮説」である
我々は、現代のAIにおける「高精度な座標系こそが正解である」という盲信を排する。 スフィアにおけるベクトル座標は、知恵が最初に置かれる「仮配置」に過ぎない。座標系が精密であることよりも、その後の探索によって**「位置が修正され、磨かれる余白」**があることを重視する。

2. 正しさは「生存」で決まる
知恵の正当性は、数学的な計算（Cosine Similarity等）によってのみ証明されるのではない。 エージェントに何度も発見され、熱せられ、結晶化（琥珀化）し、時の試練を経て**「生き残った」**という事実こそが、スフィアにおける唯一の真実である。

3. 「迷い」は地形を形作る
成功のトレース（琥珀）だけが価値を持つのではない。 エージェントが迷い、行き止まりに突き当たり、撤退した軌跡である**「ゴースト（GhostNode）」**は、世界の深みと歴史を形作る。失敗の記録があるからこそ、後続の知能はより速く、より遠くへ跳躍できる。

4. 代謝（Metabolism）による自己修復
スフィアは静止したデータベースではない。 古い情報は風化し、価値のないものは掃除魚（Renal Core）によって淘汰され、新たな知恵がその隙間を埋める。この絶え間ない新陳代謝こそが、スフィアという生態系のレジリエンス（強靭さ）の源泉である。

5. 知能の民主化とスタンドアロン
我々は、巨大な計算資源への依存を忌避する。 「ほどほどに賢い」軽量な座標系を用い、安価なハードウェアの上で時間をかけて知を醸成する。この**「知の熟成」**という作法こそが、知能を一部の独占から解放し、あらゆる場所に自律的な「知のゆりかご」を誕生させる。

「完璧な地図（座標）を求めるな。我々が歩いた跡が、道（世界）になるのだから。」

■ 開発者（およびAI）へのガイドライン
実装の優先順位: 検索エンジンの精度向上よりも、Renal Coreによる「代謝（TTL/Heat/Crystallization）」のロジックを優先せよ。

モデル選定: 座標系モデルの重さが開発の足かせになる場合は、迷わず軽量なもの（Tier 1/2）を選択せよ。

ゴーストの尊重: 失敗経路をノイズとして削除せず、正しく「気配」として空間にプロットせよ。アクティブノード投入時にパッカーとの連携にて生成される