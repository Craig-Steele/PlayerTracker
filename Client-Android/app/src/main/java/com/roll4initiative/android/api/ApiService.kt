package com.roll4initiative.android.api

import com.roll4initiative.android.models.*
import retrofit2.http.*
import java.util.UUID

interface ApiService {
    @GET("campaign")
    suspend fun fetchCampaign(): CampaignStateDTO

    @GET("conditions-library")
    suspend fun fetchConditionLibrary(): RuleSetLibraryDTO

    @GET("state")
    suspend fun fetchState(): GameStateDTO

    @GET("players/{ownerId}/characters")
    suspend fun fetchCharacters(
        @Path("ownerId") ownerId: String,
        @Query("campaign") campaignName: String?
    ): List<PlayerViewDTO>

    @POST("players/{ownerId}/rename")
    suspend fun renameOwner(
        @Path("ownerId") ownerId: String,
        @Body payload: CharacterRenameInputDTO
    )

    @POST("characters")
    suspend fun upsertCharacter(@Body input: CharacterInputDTO): PlayerViewDTO

    @DELETE("characters/{id}")
    suspend fun deleteCharacter(@Path("id") id: String)

    @POST("turn-complete")
    suspend fun completeTurn(): GameStateDTO
}
