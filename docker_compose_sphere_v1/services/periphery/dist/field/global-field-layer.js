/**
 * Sphere Project - Global Field Layer
 *
 * [Design] スフィア全体の「気候」を計算する Singleton
 * [Principle] 揮発性データのみ - DB に書き込まない
 * [Trigger] tick ベースで低頻度更新
 */
import { DEFAULT_FIELD_CONFIG } from "./types.js";
import { normalize, add, scale, subtract } from "../lib/vector.js";
/**
 * Global Field Layer - Singleton
 *
 * Periphery 内で完結、tick ベースで更新
 */
export class GlobalFieldLayer {
    currentField;
    config;
    tickCounter = 0;
    dimension;
    constructor(dimension = 384, config = {}) {
        this.dimension = dimension;
        this.config = { ...DEFAULT_FIELD_CONFIG, ...config };
        this.currentField = this.createEmptyField();
    }
    /**
     * 空の磁場を生成
     */
    createEmptyField() {
        return {
            updatedAt: Date.now(),
            vector: new Array(this.dimension).fill(0),
            intensity: this.config.emptyIntensity,
            volatility: 0,
            dominantFlags: 0,
            sampleCount: 0,
        };
    }
    /**
     * tick 毎に呼び出される
     * 設定された間隔で磁場を更新
     */
    async tick(projDB) {
        this.tickCounter++;
        if (this.tickCounter >= this.config.updateIntervalTicks) {
            this.tickCounter = 0;
            await this.update(projDB);
        }
    }
    /**
     * 磁場を即時更新 (tick 間隔を無視)
     */
    async forceUpdate(projDB) {
        this.tickCounter = 0;
        await this.update(projDB);
    }
    /**
     * 磁場計算の本体
     */
    async update(projDB) {
        const allNodes = await projDB.getAll();
        if (allNodes.length === 0) {
            this.currentField = this.createEmptyField();
            console.log(`[GlobalField] update: empty sphere`);
            return;
        }
        // サンプリング数を決定
        // [Design] 最低 minSamplePercent のノードをサンプル (気候の精度維持)
        // GlobalField は共有リソース、エージェント数に依存しない
        const percentMin = Math.floor(allNodes.length * this.config.minSamplePercent);
        const sampleSize = Math.min(Math.max(percentMin, this.config.minSampleSize), this.config.maxSampleSize, allNodes.length);
        // ランダムサンプリング
        const samples = this.randomSample(allNodes, sampleSize);
        // Harvesting: 各ノードから磁場成分を抽出
        const result = this.harvest(samples);
        this.currentField = {
            updatedAt: Date.now(),
            vector: result.centroid,
            intensity: result.avgStrength,
            volatility: result.avgVolatility,
            dominantFlags: result.combinedFlags,
            sampleCount: samples.length,
        };
        const sampleRatio = ((samples.length / allNodes.length) * 100).toFixed(1);
        console.log(`[GlobalField] update: nodes=${allNodes.length} samples=${samples.length} (${sampleRatio}%) ` +
            `intensity=${result.avgStrength.toFixed(3)} volatility=${result.avgVolatility.toFixed(3)} ` +
            `flags=0x${result.combinedFlags.toString(16)}`);
    }
    /**
     * ランダムサンプリング (Fisher-Yates)
     */
    randomSample(nodes, size) {
        if (nodes.length <= size)
            return [...nodes];
        const result = [];
        const indices = new Set();
        while (indices.size < size) {
            const idx = Math.floor(Math.random() * nodes.length);
            if (!indices.has(idx)) {
                indices.add(idx);
                result.push(nodes[idx]);
            }
        }
        return result;
    }
    /**
     * サンプルノードから磁場成分を抽出
     *
     * [Design] dominantFlags は 30%+ 閾値方式
     * 単純な論理和だとノードが多いと全ビット ON になるため
     */
    harvest(nodes) {
        if (nodes.length === 0) {
            return {
                centroid: new Array(this.dimension).fill(0),
                avgStrength: 0,
                avgVolatility: 0,
                combinedFlags: 0,
            };
        }
        let sumVector = new Array(this.dimension).fill(0);
        let totalStrength = 0;
        let totalVolatility = 0;
        // 16bit フラグの出現回数をカウント
        const flagCounts = new Array(16).fill(0);
        for (const node of nodes) {
            // Strength: sigmoid(h + w) * (1 - d/2000)
            // d は 0-2000 範囲を想定、正規化して 0-1 に
            const { h, w, d } = node.metrics;
            const strength = this.sigmoid((h + w) / 1000) * Math.max(0, 1 - d / 2000);
            // Volatility: d/1000 を 0-1 に正規化
            const volatility = Math.min(1, d / 1000);
            // 重み付き加算
            for (let i = 0; i < this.dimension; i++) {
                sumVector[i] += node.vector[i] * strength;
            }
            totalStrength += strength;
            totalVolatility += volatility;
            // フラグ出現回数をカウント
            for (let bit = 0; bit < 16; bit++) {
                if (node.metrics.flg & (1 << bit)) {
                    flagCounts[bit]++;
                }
            }
        }
        // 重心ベクトル (正規化)
        const centroid = normalize(sumVector);
        // 30%+ 閾値で dominantFlags を決定
        const threshold = nodes.length * 0.3;
        let combinedFlags = 0;
        for (let bit = 0; bit < 16; bit++) {
            if (flagCounts[bit] >= threshold) {
                combinedFlags |= (1 << bit);
            }
        }
        return {
            centroid,
            avgStrength: totalStrength / nodes.length,
            avgVolatility: totalVolatility / nodes.length,
            combinedFlags,
        };
    }
    /**
     * Sigmoid 関数
     */
    sigmoid(x) {
        return 1 / (1 + Math.exp(-x));
    }
    /**
     * 現在の Global Field を取得 (DB アクセスなし)
     */
    getGlobalField() {
        return { ...this.currentField };
    }
    /**
     * Local Field を計算 (sense() 用)
     *
     * [Design] flags は 30%+ 閾値方式 (Global と同様)
     *
     * @param agentPosition エージェントの位置ベクトル
     * @param nearbyNodes sense() でヒットした近傍ノード
     */
    computeLocalField(agentPosition, nearbyNodes) {
        if (nearbyNodes.length === 0) {
            return {
                direction: new Array(this.dimension).fill(0),
                strength: 0,
                flags: 0,
                nodeCount: 0,
            };
        }
        let sumDirection = new Array(this.dimension).fill(0);
        let totalStrength = 0;
        // 16bit フラグの出現回数をカウント
        const flagCounts = new Array(16).fill(0);
        for (const node of nearbyNodes) {
            // Direction: エージェントから見たノードの方向
            const direction = subtract(node.vector, agentPosition);
            const normalizedDir = normalize(direction);
            // Strength
            const { h, w, d } = node.metrics;
            const strength = this.sigmoid((h + w) / 1000) * Math.max(0, 1 - d / 2000);
            // 重み付き加算
            for (let i = 0; i < this.dimension; i++) {
                sumDirection[i] += normalizedDir[i] * strength;
            }
            totalStrength += strength;
            // フラグ出現回数をカウント
            for (let bit = 0; bit < 16; bit++) {
                if (node.metrics.flg & (1 << bit)) {
                    flagCounts[bit]++;
                }
            }
        }
        // 30%+ 閾値で flags を決定
        const threshold = nearbyNodes.length * 0.3;
        let combinedFlags = 0;
        for (let bit = 0; bit < 16; bit++) {
            if (flagCounts[bit] >= threshold) {
                combinedFlags |= (1 << bit);
            }
        }
        return {
            direction: normalize(sumDirection),
            strength: totalStrength / nearbyNodes.length,
            flags: combinedFlags,
            nodeCount: nearbyNodes.length,
        };
    }
    /**
     * Global + Local を合成 (エージェント用)
     *
     * メモより:
     * const field =
     *   localField.scale(0.7)
     *   .add(globalField.scale(0.1))
     *   .add(agent.chaos.scale(0.2));
     */
    compositeDirection(agentPosition, localField, chaosVector) {
        // Local: 0.7, Global: 0.1, Chaos: 0.2
        const localComponent = scale(localField.direction, 0.7);
        const globalComponent = scale(this.currentField.vector, 0.1);
        let result = add(localComponent, globalComponent);
        if (chaosVector && chaosVector.length === this.dimension) {
            const chaosComponent = scale(chaosVector, 0.2);
            result = add(result, chaosComponent);
        }
        return normalize(result);
    }
    /**
     * デバッグ用: 現在の状態を取得
     */
    getDebugInfo() {
        return {
            field: this.getGlobalField(),
            tickCounter: this.tickCounter,
            config: this.config,
        };
    }
}
//# sourceMappingURL=global-field-layer.js.map