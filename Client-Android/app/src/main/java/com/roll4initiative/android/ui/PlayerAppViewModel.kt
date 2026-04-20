package com.roll4initiative.android.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.roll4initiative.android.api.ApiService
import com.roll4initiative.android.models.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.*

private val android.content.Context.dataStore by preferencesDataStore(name = "settings")

class PlayerAppViewModel(application: Application) : AndroidViewModel(application) {
    private val context = application.applicationContext
    private val json = Json { ignoreUnknownKeys = true }

    var serverURLString by mutableStateOf("http://192.168.1.130:8080")
    var playerName by mutableStateOf("")
    var ownerId by mutableStateOf(UUID.randomUUID())

    var campaign by mutableStateOf<CampaignStateDTO?>(null)
    var ruleSet by mutableStateOf<RuleSetLibraryDTO?>(null)
    var gameState by mutableStateOf<GameStateDTO?>(null)
    var myCharacters by mutableStateOf<List<PlayerViewDTO>>(emptyList())
    var statusMessage by mutableStateOf("Not connected")
    var isLoading by mutableStateOf(false)
    var lastError by mutableStateOf<String?>(null)

    private var refreshJob: Job? = null

    private val serverURLKey = stringPreferencesKey("android.serverURL")
    private val playerNameKey = stringPreferencesKey("android.playerName")
    private val ownerIdKey = stringPreferencesKey("android.ownerId")

    init {
        viewModelScope.launch {
            val prefs = context.dataStore.data.first()
            serverURLString = prefs[serverURLKey] ?: "http://192.168.1.130:8080"
            playerName = prefs[playerNameKey] ?: ""
            val rawId = prefs[ownerIdKey]
            if (rawId != null) {
                ownerId = UUID.fromString(rawId)
            } else {
                val fresh = UUID.randomUUID()
                ownerId = fresh
                context.dataStore.edit { it[ownerIdKey] = fresh.toString() }
            }
            connect()
        }
    }

    fun startPolling() {
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            while (isActive) {
                refreshAll(showStatus = false)
                delay(5000)
            }
        }
    }

    fun stopPolling() {
        refreshJob?.cancel()
        refreshJob = null
    }

    fun connect() {
        viewModelScope.launch {
            saveSettings()
            refreshAll(showStatus = true)
            startPolling()
        }
    }

    private suspend fun saveSettings() {
        context.dataStore.edit {
            it[serverURLKey] = serverURLString
            it[playerNameKey] = playerName
        }
    }

    private fun getApiService(): ApiService? {
        return try {
            val normalized = if (serverURLString.startsWith("http://") || serverURLString.startsWith("https://")) {
                serverURLString
            } else {
                "http://$serverURLString"
            }
            val baseUrl = if (normalized.endsWith("/")) normalized else "$normalized/"
            
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
            val client = OkHttpClient.Builder()
                .addInterceptor(logging)
                .build()

            Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(client)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(ApiService::class.java)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun refreshAll(showStatus: Boolean) {
        val api = getApiService() ?: return
        isLoading = true
        try {
            val resolvedCampaign = api.fetchCampaign()
            val resolvedRuleSet = api.fetchConditionLibrary()
            val resolvedState = api.fetchState()
            val characters = api.fetchCharacters(ownerId.toString(), resolvedCampaign.name)

            campaign = resolvedCampaign
            ruleSet = resolvedRuleSet
            gameState = resolvedState
            myCharacters = characters
            lastError = null
            if (showStatus) {
                statusMessage = "Connected"
            }
        } catch (e: Exception) {
            lastError = e.localizedMessage
            if (showStatus || campaign == null) {
                statusMessage = e.localizedMessage ?: "Unknown error"
            }
        } finally {
            isLoading = false
        }
    }

    fun savePlayerName() {
        viewModelScope.launch {
            val api = getApiService() ?: return@launch
            try {
                api.renameOwner(ownerId.toString(), CharacterRenameInputDTO(playerName))
                saveSettings()
                statusMessage = "Player name saved."
                refreshAll(showStatus = false)
            } catch (e: Exception) {
                statusMessage = e.localizedMessage ?: "Error saving player name"
            }
        }
    }

    fun saveCharacter(draft: CharacterDraft) {
        viewModelScope.launch {
            val api = getApiService() ?: return@launch
            val currentCampaign = campaign ?: return@launch
            
            try {
                val payload = CharacterInputDTO(
                    id = draft.id,
                    campaignName = currentCampaign.name,
                    ownerId = ownerId,
                    ownerName = playerName,
                    name = draft.name,
                    initiative = draft.id?.let { id -> myCharacters.find { it.id == id }?.initiative },
                    stats = draft.buildStatsPayload(ruleSet?.allowNegativeHealth ?: false),
                    revealStats = draft.revealStats,
                    autoSkipTurn = draft.autoSkipTurn,
                    useAppInitiativeRoll = draft.useAppInitiativeRoll,
                    initiativeBonus = draft.initiativeBonus.toIntOrNull() ?: 0,
                    conditions = draft.selectedConditions.toList().sorted()
                )
                api.upsertCharacter(payload)
                statusMessage = if (draft.id == null) "Character added." else "Character saved."
                refreshAll(showStatus = false)
            } catch (e: Exception) {
                statusMessage = e.localizedMessage ?: "Error saving character"
            }
        }
    }

    fun deleteCharacter(id: UUID) {
        viewModelScope.launch {
            val api = getApiService() ?: return@launch
            try {
                api.deleteCharacter(id.toString())
                statusMessage = "Character deleted."
                refreshAll(showStatus = false)
            } catch (e: Exception) {
                statusMessage = e.localizedMessage ?: "Error deleting character"
            }
        }
    }

    fun completeTurn() {
        viewModelScope.launch {
            val api = getApiService() ?: return@launch
            try {
                api.completeTurn()
                statusMessage = "Turn advanced."
                refreshAll(showStatus = false)
            } catch (e: Exception) {
                statusMessage = e.localizedMessage ?: "Error completing turn"
            }
        }
    }

    fun adjustStat(character: PlayerViewDTO, statKey: String, delta: Int) {
        val draft = CharacterDraft.fromPlayer(character, ruleSet)
        val stats = draft.stats.toMutableList()
        val index = stats.indexOfFirst { it.key == statKey }
        if (index != -1) {
            val entry = stats[index]
            val cur = entry.currentValue
            if (statKey == "TempHP") {
                stats[index] = entry.copy(current = (cur + delta).coerceAtLeast(0).toString())
            } else {
                val max = entry.maxValue
                val allowNegative = ruleSet?.allowNegativeHealth ?: false
                val next = if (allowNegative) cur + delta else (cur + delta).coerceAtLeast(0)
                stats[index] = entry.copy(current = next.coerceAtMost(max).toString())
            }
            draft.stats = stats
            saveCharacter(draft)
        }
    }

    fun setInitiative(character: PlayerViewDTO, initiative: Double?) {
        viewModelScope.launch {
            val api = getApiService() ?: return@launch
            try {
                val payload = CharacterInputDTO(
                    id = character.id,
                    campaignName = campaign?.name,
                    ownerId = ownerId,
                    ownerName = character.ownerName,
                    name = character.name,
                    initiative = initiative,
                    stats = character.stats,
                    revealStats = character.revealStats,
                    autoSkipTurn = character.autoSkipTurn,
                    useAppInitiativeRoll = character.useAppInitiativeRoll,
                    initiativeBonus = character.initiativeBonus,
                    conditions = character.conditions
                )
                api.upsertCharacter(payload)
                statusMessage = if (initiative == null) "Initiative cleared." else "Initiative set."
                refreshAll(showStatus = false)
            } catch (e: Exception) {
                statusMessage = e.localizedMessage ?: "Error setting initiative"
            }
        }
    }

    fun updateConditions(character: PlayerViewDTO, conditions: List<String>) {
        viewModelScope.launch {
            val api = getApiService() ?: return@launch
            try {
                val payload = CharacterInputDTO(
                    id = character.id,
                    campaignName = campaign?.name,
                    ownerId = ownerId,
                    ownerName = character.ownerName,
                    name = character.name,
                    initiative = character.initiative,
                    stats = character.stats,
                    revealStats = character.revealStats,
                    autoSkipTurn = character.autoSkipTurn,
                    useAppInitiativeRoll = character.useAppInitiativeRoll,
                    initiativeBonus = character.initiativeBonus,
                    conditions = conditions
                )
                api.upsertCharacter(payload)
                refreshAll(showStatus = false)
            } catch (e: Exception) {
                lastError = "Failed to update conditions: ${e.message}"
            }
        }
    }

    fun clearInitiative(character: PlayerViewDTO) {
        setInitiative(character, null)
    }

    val isMyTurn: Boolean
        get() = gameState?.players?.any { it.ownerId == ownerId && it.id == gameState?.currentTurnId } == true

    fun isCurrentTurn(character: PlayerViewDTO) = gameState?.currentTurnId == character.id
}
