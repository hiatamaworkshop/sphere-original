/**
 * Sphere Project - Pulse Packet Definition
 *
 * [Role] Environmental Broadcast Signal
 * [Purpose] UDP broadcast for external Observatory monitoring
 *
 * PulsePacket は RenalCore の代謝状態を外部に放射する信号。
 * Observatory がこれを受信し、統計的異常を検知する。
 */
/**
 * Pulse Flags: 環境異常フラグ (bitfield)
 */
export const PulseFlag = {
    /** Burst: 急激な熱上昇 */
    Burst: 0x01,
    /** Thorn: Ghost過多 */
    Thorn: 0x02,
    /** Bloom: Amber結晶化発生中 */
    Bloom: 0x04,
    /** Drought: 活性ノード不足 */
    Drought: 0x08,
    /** Storm: 大量蒸発発生中 */
    Storm: 0x10,
};
//# sourceMappingURL=pulse.js.map