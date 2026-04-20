package com.roll4initiative.android.models

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import java.util.UUID

object UUIDSerializer : KSerializer<UUID> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("UUID", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: UUID) = encoder.encodeString(value.toString())
    override fun deserialize(decoder: Decoder): UUID = UUID.fromString(decoder.decodeString())
}

@Serializable
data class CampaignStateDTO(
    val name: String,
    val rulesetId: String,
    val rulesetLabel: String,
    val encounterState: EncounterStateDTO
)

@Serializable
enum class EncounterStateDTO {
    new, active, suspended
}

@Serializable
data class RuleSetLibraryDTO(
    val id: String,
    val label: String,
    val icon: String? = null,
    val rulesBaseUrl: String? = null,
    val conditions: List<ConditionDefinitionDTO>,
    val stats: List<String>? = null,
    val supportsTempHp: Boolean? = null,
    val allowNegativeHealth: Boolean? = null,
    val license: String? = null,
    val standardDie: String? = null
)

@Serializable
data class ConditionDefinitionDTO(
    val name: String,
    val abbreviation: String? = null,
    val description: String? = null
)

@Serializable
data class StatEntryDTO(
    val key: String,
    val current: Int,
    val max: Int
)

@Serializable
data class PlayerViewDTO(
    @Serializable(with = UUIDSerializer::class)
    val id: UUID,
    @Serializable(with = UUIDSerializer::class)
    val ownerId: UUID,
    val ownerName: String,
    val name: String,
    val initiative: Double? = null,
    val stats: List<StatEntryDTO>,
    val revealStats: Boolean,
    val autoSkipTurn: Boolean,
    val useAppInitiativeRoll: Boolean,
    val initiativeBonus: Int,
    val conditions: List<String>
)

@Serializable
data class GameStateDTO(
    val round: Int,
    val encounterState: EncounterStateDTO,
    @Serializable(with = UUIDSerializer::class)
    val currentTurnId: UUID? = null,
    val currentTurnName: String? = null,
    val players: List<PlayerViewDTO>
)

@Serializable
data class CharacterInputDTO(
    @Serializable(with = UUIDSerializer::class)
    val id: UUID? = null,
    val campaignName: String? = null,
    @Serializable(with = UUIDSerializer::class)
    val ownerId: UUID? = null,
    val ownerName: String,
    val name: String,
    val initiative: Double? = null,
    val stats: List<StatEntryDTO>? = null,
    val revealStats: Boolean? = null,
    val autoSkipTurn: Boolean? = null,
    val useAppInitiativeRoll: Boolean? = null,
    val initiativeBonus: Int? = null,
    val conditions: List<String>? = null
)

@Serializable
data class CharacterRenameInputDTO(
    val name: String
)

data class EditableStat(
    val key: String,
    val current: String,
    val max: String
) {
    val currentValue: Int get() = current.trim().toIntOrNull() ?: 0
    val maxValue: Int get() = max.trim().toIntOrNull() ?: 0
}

data class CharacterDraft(
    val id: UUID?,
    val ownerName: String,
    var name: String,
    var revealStats: Boolean,
    var autoSkipTurn: Boolean,
    var useAppInitiativeRoll: Boolean,
    var initiativeBonus: String,
    var stats: List<EditableStat>,
    var selectedConditions: Set<String>
) {
    companion object {
        fun new(ruleSet: RuleSetLibraryDTO?, ownerName: String): CharacterDraft {
            val statKeys = ruleSet?.stats ?: listOf("HP")
            val supportsTempHp = ruleSet?.supportsTempHp ?: false
            
            return CharacterDraft(
                id = null,
                ownerName = ownerName,
                name = "",
                revealStats = false,
                autoSkipTurn = false,
                useAppInitiativeRoll = true,
                initiativeBonus = "",
                stats = createEditableStats(statKeys, supportsTempHp, emptyList()),
                selectedConditions = emptySet()
            )
        }

        fun fromPlayer(player: PlayerViewDTO, ruleSet: RuleSetLibraryDTO?): CharacterDraft {
            val statKeys = ruleSet?.stats ?: listOf("HP")
            val supportsTempHp = ruleSet?.supportsTempHp ?: false

            return CharacterDraft(
                id = player.id,
                ownerName = player.ownerName,
                name = player.name,
                revealStats = player.revealStats,
                autoSkipTurn = player.autoSkipTurn,
                useAppInitiativeRoll = player.useAppInitiativeRoll,
                initiativeBonus = player.initiativeBonus.toString(),
                stats = createEditableStats(statKeys, supportsTempHp, player.stats),
                selectedConditions = player.conditions.toSet()
            )
        }

        private fun createEditableStats(
            statKeys: List<String>,
            supportsTempHp: Boolean,
            sourceStats: List<StatEntryDTO>
        ): List<EditableStat> {
            val keysToInclude = statKeys.toMutableList()
            if (keysToInclude.isEmpty() && !supportsTempHp) {
                keysToInclude.add("HP")
            }
            
            val orderedKeys = mutableListOf<String>()
            orderedKeys.addAll(keysToInclude)
            
            if (supportsTempHp && !orderedKeys.contains("TempHP")) {
                orderedKeys.add("TempHP")
            }

            if (orderedKeys.isEmpty()) {
                orderedKeys.add("HP")
            }

            return orderedKeys.map { key ->
                val existing = sourceStats.find { it.key == key }
                val current = when {
                    existing != null -> existing.current.toString()
                    key == "TempHP" -> "0"
                    else -> ""
                }
                val max = when {
                    key == "TempHP" -> ""
                    else -> existing?.max?.toString() ?: ""
                }
                EditableStat(key, current, max)
            }
        }
    }

    fun buildStatsPayload(allowNegativeHealth: Boolean): List<StatEntryDTO>? {
        val payload = stats.mapNotNull { entry ->
            val cur = entry.currentValue
            if (entry.key == "TempHP") {
                return@mapNotNull StatEntryDTO(entry.key, cur.coerceAtLeast(0), 0)
            }

            val m = entry.maxValue
            if (m <= 0) return@mapNotNull null
            val boundedCurrent = if (allowNegativeHealth) {
                cur.coerceAtMost(m)
            } else {
                cur.coerceIn(0, m)
            }
            StatEntryDTO(entry.key, boundedCurrent, m)
        }
        return payload.ifEmpty { null }
    }
}
