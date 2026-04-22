package com.roll4initiative.android.ui

import android.content.res.Configuration
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import kotlinx.coroutines.launch
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import android.graphics.Bitmap
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import coil.compose.AsyncImage
import com.roll4initiative.android.models.*
import java.util.*

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MainScreen(viewModel: PlayerAppViewModel) {
    val lastError = viewModel.lastError
    
    var showingSettings by remember { mutableStateOf(false) }
    var editorDraft by remember { mutableStateOf<CharacterDraft?>(null) }
    var conditionsCharacter by remember { mutableStateOf<PlayerViewDTO?>(null) }
    var initiativeCharacter by remember { mutableStateOf<PlayerViewDTO?>(null) }

    Scaffold { padding ->
        val configuration = LocalConfiguration.current
        val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Campaign header always spans the full width
            EncounterCard(
                viewModel = viewModel,
                onShowSettings = { showingSettings = true },
                onAddCharacter = { editorDraft = CharacterDraft.new(viewModel.ruleSet, viewModel.playerName) }
            )

            if (isLandscape) {
                Row(
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    // Left Column: Characters
                    Column(
                        modifier = Modifier
                            .weight(1.2f)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(20.dp)
                    ) {
                        if (viewModel.myCharacters.isEmpty()) {
                            EmptyCard("No characters yet. Tap + to add one.")
                        } else {
                            viewModel.myCharacters.sortedBy { it.name }.forEach { character ->
                                CharacterCard(
                                    character,
                                    viewModel,
                                    onEdit = { editorDraft = CharacterDraft.fromPlayer(character, viewModel.ruleSet) },
                                    onEditConditions = { conditionsCharacter = character },
                                    onEditInitiative = { initiativeCharacter = character }
                                )
                            }
                        }
                    }

                    // Right Column: Initiative
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(20.dp)
                    ) {
                        InitiativeSection(
                            viewModel,
                            onEditInitiative = { initiativeCharacter = it }
                        )
                    }
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    if (viewModel.myCharacters.isEmpty()) {
                        EmptyCard("No characters yet. Tap + to add one.")
                    } else {
                        viewModel.myCharacters.sortedBy { it.name }.forEach { character ->
                            CharacterCard(
                                character,
                                viewModel,
                                onEdit = { editorDraft = CharacterDraft.fromPlayer(character, viewModel.ruleSet) },
                                onEditConditions = { conditionsCharacter = character },
                                onEditInitiative = { initiativeCharacter = character }
                            )
                        }
                    }

                    InitiativeSection(
                        viewModel,
                        onEditInitiative = { initiativeCharacter = it }
                    )
                    
                    if (lastError != null) {
                        Text(lastError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }

    if (showingSettings) {
        SettingsDialog(
            viewModel = viewModel,
            onDismiss = { showingSettings = false }
        )
    }

    conditionsCharacter?.let { character ->
        val selected = remember { mutableStateListOf(*character.conditions.toTypedArray()) }
        ConditionsBrowserDialog(
            availableConditions = viewModel.ruleSet?.conditions ?: emptyList(),
            selectedConditions = selected,
            rulesetIcon = viewModel.ruleSet?.icon,
            serverURL = viewModel.serverURLString,
            onDismiss = { conditionsCharacter = null },
            onSave = {
                viewModel.updateConditions(character, selected.toList())
                conditionsCharacter = null
            }
        )
    }

    initiativeCharacter?.let { character ->
        InitiativeEditorDialog(
            character = character,
            onDismiss = { initiativeCharacter = null },
            onSave = { newInit ->
                viewModel.setInitiative(character, newInit)
                initiativeCharacter = null
            }
        )
    }

    editorDraft?.let { draft ->
        CharacterEditorDialog(
            draft = draft,
            ruleSet = viewModel.ruleSet,
            serverURL = viewModel.serverURLString,
            onDismiss = { editorDraft = null },
            onSave = { 
                viewModel.saveCharacter(it)
                editorDraft = null
            },
            onDelete = { id ->
                viewModel.deleteCharacter(id)
                editorDraft = null
            }
        )
    }
}

@Composable
fun EncounterCard(
    viewModel: PlayerAppViewModel,
    onShowSettings: () -> Unit,
    onAddCharacter: () -> Unit
) {
    val campaign = viewModel.campaign
    val gameState = viewModel.gameState
    val isMyTurn = viewModel.isMyTurn

    Card(
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    campaign?.name ?: "No campaign connected",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    "Player: ${viewModel.playerName.ifBlank { "Not set" }}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (gameState != null) {
                    Text(
                        "Round ${gameState.round}",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                
                val currentTurnText = when {
                    gameState?.encounterState == EncounterStateDTO.new -> "New Encounter"
                    gameState?.encounterState == EncounterStateDTO.suspended -> "Encounter Suspended"
                    isMyTurn -> "Your turn: ${gameState?.currentTurnName}"
                    gameState?.currentTurnName != null -> "Current turn: ${gameState.currentTurnName}"
                    else -> campaign?.rulesetLabel ?: "Waiting..."
                }
                
                Text(
                    currentTurnText,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isMyTurn) Color.Red else MaterialTheme.colorScheme.onSurface
                )
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                val iconUrl = viewModel.ruleSet?.icon?.let { icon ->
                    if (icon.startsWith("http")) icon 
                    else "${viewModel.serverURLString.removeSuffix("/")}/rulesets/${icon.removePrefix("/")}"
                }

                if (iconUrl != null) {
                    AsyncImage(
                        model = iconUrl,
                        contentDescription = null,
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(10.dp)),
                        contentScale = ContentScale.Fit
                    )
                }
                
                Row {
                    IconButton(onClick = onShowSettings) {
                        Icon(Icons.Default.Settings, "Settings", tint = MaterialTheme.colorScheme.primary)
                    }
                    IconButton(onClick = onAddCharacter) {
                        Icon(Icons.Default.Add, "Add Character", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CharacterCard(
    character: PlayerViewDTO, 
    viewModel: PlayerAppViewModel, 
    onEdit: () -> Unit,
    onEditConditions: () -> Unit,
    onEditInitiative: () -> Unit
) {
    var expanded by remember { mutableStateOf(true) }
    val isCurrentTurn = viewModel.isCurrentTurn(character)
    val haptic = LocalHapticFeedback.current

    Card(
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = { expanded = !expanded },
                onLongClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.clearInitiative(character)
                }
            )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(vertical = 4.dp)
            ) {
                Icon(
                    if (expanded) Icons.Default.KeyboardArrowDown else Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null
                )
                Text(
                    character.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (isCurrentTurn) Color.Red else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(start = 8.dp)
                )
                Spacer(modifier = Modifier.weight(1f))
                
                if (character.initiative == null) {
                    IconButton(
                        onClick = { 
                            val rolled = DiceLogic.roll(viewModel.ruleSet?.standardDie ?: "1d20")?.let { it + character.initiativeBonus }
                            viewModel.setInitiative(character, rolled?.toDouble())
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.Casino, contentDescription = "Roll Initiative", tint = MaterialTheme.colorScheme.primary)
                    }
                } else if (expanded) {
                    Surface(
                        onClick = onEditInitiative,
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            "Init ${formatInitiative(character.initiative)}",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            if (expanded) {
                Spacer(modifier = Modifier.height(14.dp))
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    character.stats.forEach { stat ->
                        StatPod(character, stat, viewModel)
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))
                
                // Conditions summary
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onEditConditions() }
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp, 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            if (character.conditions.isEmpty()) "Conditions" else character.conditions.joinToString(", "),
                            style = MaterialTheme.typography.bodySmall,
                            color = if (character.conditions.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1f)
                        )
                        Icon(
                            Icons.Default.Edit,
                            contentDescription = "Edit Conditions",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = onEdit) {
                        Text("Edit")
                    }
                    
                    if (isCurrentTurn) {
                        Button(onClick = { viewModel.completeTurn() }) {
                            Text("Turn Complete")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StatPod(character: PlayerViewDTO, stat: StatEntryDTO, viewModel: PlayerAppViewModel) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.width(110.dp)
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp)
        ) {
            IconButton(
                onClick = { viewModel.adjustStat(character, stat.key, 1) },
                modifier = Modifier.size(32.dp)
            ) {
                Icon(Icons.Default.Add, "Increase ${stat.key}")
            }
            
            Text(
                stat.key,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
            
            Text(
                if (stat.key == "TempHP") "${stat.current}" else "${stat.current}/${stat.max}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold
            )

            IconButton(
                onClick = { viewModel.adjustStat(character, stat.key, -1) },
                modifier = Modifier.size(32.dp)
            ) {
                Icon(Icons.Default.Remove, "Decrease ${stat.key}")
            }
        }
    }
}

@Composable
fun InitiativeSection(viewModel: PlayerAppViewModel, onEditInitiative: (PlayerViewDTO) -> Unit) {
    val players = viewModel.gameState?.players ?: emptyList()
    
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Encounter Order", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        
        if (players.isEmpty()) {
            EmptyCard("No combatants yet.")
        } else {
            players.forEach { player ->
                InitiativeRow(player, viewModel, onEditInitiative)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InitiativeRow(player: PlayerViewDTO, viewModel: PlayerAppViewModel, onEditInitiative: (PlayerViewDTO) -> Unit) {
    val isCurrentTurn = viewModel.isCurrentTurn(player)
    val isOwner = player.ownerId == viewModel.ownerId
    val backgroundColor = if (isCurrentTurn) Color.Yellow.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceVariant

    Surface(
        color = backgroundColor,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (isOwner) Modifier.clickable { onEditInitiative(player) }
                else Modifier
            )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Top
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        player.name,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (isCurrentTurn) FontWeight.Bold else FontWeight.Normal
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(
                        color = MaterialTheme.colorScheme.tertiaryContainer,
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            formatInitiative(player.initiative),
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onTertiaryContainer,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Text(
                    player.ownerName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Column(horizontalAlignment = Alignment.End) {
                HealthBadge(player, viewModel)
                if (player.conditions.isNotEmpty()) {
                    FlowRow(
                        modifier = Modifier.padding(top = 4.dp),
                        horizontalArrangement = Arrangement.End,
                        maxItemsInEachRow = 3
                    ) {
                        player.conditions.forEach { condition ->
                            Surface(
                                color = MaterialTheme.colorScheme.secondaryContainer,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.padding(2.dp)
                            ) {
                                Text(
                                    condition,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun HealthBadge(player: PlayerViewDTO, viewModel: PlayerAppViewModel) {
    val isOwner = player.ownerId == viewModel.ownerId
    val showStats = isOwner || player.revealStats
    
    val healthStats = player.stats.filter { it.key != "TempHP" }
    val current = healthStats.sumOf { it.current }
    val max = healthStats.sumOf { it.max }
    
    val backgroundColor: Color
    val textColor: Color

    val isDead = current <= 0 && max > 0
    val ratio = if (max > 0) current.toDouble() / max else 1.0

    if (isDead) {
        backgroundColor = Color(0xFF4A4A4A) // Dark Gray (~0.29 rgb)
        textColor = Color.White
    } else if (ratio >= 1.0) {
        backgroundColor = Color(0xFFCFE8FF) // Light Blue
        textColor = Color(0xFF0F3B5E) // Dark Blue
    } else if (ratio > 0.75) {
        backgroundColor = Color(0xFFD6F5D6) // Light Green
        textColor = Color(0xFF124A1C) // Dark Green
    } else if (ratio > 0.5) {
        backgroundColor = Color(0xFFFFF2B3) // Light Yellow
        textColor = Color(0xFF5E4A00) // Dark Yellow
    } else if (ratio > 0.25) {
        backgroundColor = Color(0xFFFFD6B3) // Light Orange
        textColor = Color(0xFF6B3B00) // Dark Orange
    } else {
        backgroundColor = Color(0xFFFFC2C2) // Light Red
        textColor = Color(0xFF590A0A) // Dark Red
    }

    val text = if (showStats) {
        player.stats.filter { it.key != "TempHP" || it.current > 0 }
            .joinToString(" • ") { stat ->
                if (stat.key == "TempHP") "TempHP ${stat.current}"
                else "${stat.key} ${stat.current}/${stat.max}"
            }
    } else {
        if (max == 0) "—"
        else {
            when {
                isDead -> "Dead"
                ratio >= 1.0 -> "Full"
                ratio > 0.75 -> "Slight Damage"
                ratio > 0.5 -> "Some Damage"
                ratio > 0.25 -> "Bloodied"
                else -> "Heavily Blooded"
            }
        }
    }

    Surface(
        color = backgroundColor,
        shape = RoundedCornerShape(12.dp)
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = textColor
        )
    }
}

@Composable
fun EmptyCard(message: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            message,
            modifier = Modifier.padding(16.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

fun formatInitiative(initiative: Double?): String {
    if (initiative == null) return "X"
    return if (initiative == initiative.toInt().toDouble()) initiative.toInt().toString() else initiative.toString()
}

@Composable
fun SettingsDialog(viewModel: PlayerAppViewModel, onDismiss: () -> Unit) {
    var url by remember { mutableStateOf(viewModel.serverURLString) }
    var name by remember { mutableStateOf(viewModel.playerName) }
    var showingScanner by remember { mutableStateOf(false) }
    val context = LocalContext.current

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            showingScanner = true
        }
    }

    if (showingScanner) {
        QRScannerDialog(
            onDismiss = { showingScanner = false },
            onScan = { scannedUrl ->
                url = scannedUrl
                showingScanner = false
            }
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Settings") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                // QR Code Display
                if (url.isNotBlank()) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Scan to connect", style = MaterialTheme.typography.labelMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                        QRCodeImage(url)
                    }
                }

                TextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("Server URL") },
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = {
                        IconButton(onClick = {
                            if (context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                showingScanner = true
                            } else {
                                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                            }
                        }) {
                            Icon(Icons.Default.QrCodeScanner, "Scan QR Code")
                        }
                    }
                )
                TextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Player Name") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                viewModel.serverURLString = url
                viewModel.playerName = name
                viewModel.savePlayerName()
                viewModel.connect()
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun QRCodeImage(text: String) {
    val bitmap = remember(text) {
        try {
            val writer = QRCodeWriter()
            val bitMatrix = writer.encode(text, BarcodeFormat.QR_CODE, 512, 512)
            val width = bitMatrix.width
            val height = bitMatrix.height
            val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
            for (x in 0 until width) {
                for (y in 0 until height) {
                    bmp.setPixel(x, y, if (bitMatrix.get(x, y)) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
                }
            }
            bmp
        } catch (e: Exception) {
            null
        }
    }

    bitmap?.let {
        Image(
            bitmap = it.asImageBitmap(),
            contentDescription = "Connection QR Code",
            modifier = Modifier
                .size(150.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color.White)
                .padding(8.dp)
        )
    }
}

@Composable
fun QRScannerDialog(onDismiss: () -> Unit, onScan: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    var zoomRatio by remember { mutableFloatStateOf(1f) }
    var maxZoom by remember { mutableFloatStateOf(1f) }
    var cameraControl by remember { mutableStateOf<androidx.camera.core.CameraControl?>(null) }

    LaunchedEffect(zoomRatio) {
        cameraControl?.setZoomRatio(zoomRatio)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Scan Server QR Code") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(300.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .pointerInput(maxZoom) {
                            detectTransformGestures { _, _, zoom, _ ->
                                zoomRatio = (zoomRatio * zoom).coerceIn(1f, maxZoom.coerceAtLeast(1f))
                            }
                        }
                ) {
                    AndroidView(
                        factory = { ctx ->
                            val previewView = PreviewView(ctx)
                            val executor = ContextCompat.getMainExecutor(ctx)
                            cameraProviderFuture.addListener({
                                val cameraProvider = cameraProviderFuture.get()
                                val preview = androidx.camera.core.Preview.Builder().build().also {
                                    it.setSurfaceProvider(previewView.surfaceProvider)
                                }

                                val scanner = BarcodeScanning.getClient()
                                val imageAnalysis = ImageAnalysis.Builder()
                                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                    .build()

                                imageAnalysis.setAnalyzer(executor) { imageProxy ->
                                    val mediaImage = imageProxy.image
                                    if (mediaImage != null) {
                                        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                                        scanner.process(image)
                                            .addOnSuccessListener { barcodes ->
                                                barcodes.firstOrNull()?.rawValue?.let { onScan(it) }
                                            }
                                            .addOnCompleteListener { imageProxy.close() }
                                    } else {
                                        imageProxy.close()
                                    }
                                }

                                val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                                try {
                                    cameraProvider.unbindAll()
                                    val camera = cameraProvider.bindToLifecycle(
                                        lifecycleOwner,
                                        cameraSelector,
                                        preview,
                                        imageAnalysis
                                    )
                                    
                                    cameraControl = camera.cameraControl
                                    camera.cameraInfo.zoomState.observe(lifecycleOwner) { state ->
                                        maxZoom = state.maxZoomRatio
                                    }
                                } catch (e: Exception) {
                                    // Handle exception
                                }
                            }, executor)
                            previewView
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                }

                if (maxZoom > 1f) {
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.ZoomOut, contentDescription = null, modifier = Modifier.size(16.dp))
                            Slider(
                                value = zoomRatio,
                                onValueChange = { zoomRatio = it },
                                valueRange = 1f..maxZoom.coerceAtLeast(1.1f),
                                modifier = Modifier.weight(1f).padding(horizontal = 8.dp)
                            )
                            Icon(Icons.Default.ZoomIn, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                        Text(
                            "Zoom: ${"%.1f".format(zoomRatio)}x",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun CharacterEditorDialog(
    draft: CharacterDraft,
    ruleSet: RuleSetLibraryDTO?,
    serverURL: String,
    onDismiss: () -> Unit,
    onSave: (CharacterDraft) -> Unit,
    onDelete: (UUID) -> Unit
) {
    var name by remember(draft) { mutableStateOf(draft.name) }
    var useAppInitiativeRoll by remember(draft) { mutableStateOf(draft.useAppInitiativeRoll) }
    var initiativeBonus by remember(draft) { mutableStateOf(draft.initiativeBonus) }
    var autoSkipTurn by remember(draft) { mutableStateOf(draft.autoSkipTurn) }
    var revealStats by remember(draft) { mutableStateOf(draft.revealStats) }
    
    val stats = remember(draft) { 
        mutableStateListOf<EditableStat>().apply { addAll(draft.stats) }
    }
    val selectedConditions = remember(draft) { 
        mutableStateListOf<String>().apply { addAll(draft.selectedConditions) }
    }
    
    var showingConditionsBrowser by remember { mutableStateOf(false) }

    if (showingConditionsBrowser) {
        ConditionsBrowserDialog(
            availableConditions = ruleSet?.conditions ?: emptyList(),
            selectedConditions = selectedConditions,
            rulesetIcon = ruleSet?.icon,
            serverURL = serverURL,
            onDismiss = { showingConditionsBrowser = false },
            onSave = { showingConditionsBrowser = false }
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.padding(16.dp).fillMaxWidth(),
        title = { Text(if (draft.id == null) "New Character" else "Edit Character") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Name
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Words,
                        imeAction = ImeAction.Next
                    ),
                    singleLine = true
                )

                // Initiative
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Initiative", style = MaterialTheme.typography.titleSmall)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .weight(1f)
                                .clickable { useAppInitiativeRoll = !useAppInitiativeRoll }
                        ) {
                            Checkbox(
                                checked = useAppInitiativeRoll,
                                onCheckedChange = { useAppInitiativeRoll = it })
                            Text("Use app to roll initiative", style = MaterialTheme.typography.bodyMedium)
                        }
                        if (useAppInitiativeRoll) {
                            OutlinedTextField(
                                value = initiativeBonus,
                                onValueChange = { initiativeBonus = it },
                                label = { Text("Initiative Bonus") },
                                modifier = Modifier.weight(0.6f),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Number,
                                    imeAction = ImeAction.Next
                                ),
                                singleLine = true
                            )
                        }
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable { autoSkipTurn = !autoSkipTurn }
                    ) {
                        Checkbox(checked = autoSkipTurn, onCheckedChange = { autoSkipTurn = it })
                        Text("Automatically skip turn")
                    }
                }

                // Stats
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Stats", style = MaterialTheme.typography.titleSmall)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable { revealStats = !revealStats }
                    ) {
                        Checkbox(checked = revealStats, onCheckedChange = { revealStats = it })
                        Text("Share stats with others")
                    }
                    
                    stats.forEachIndexed { index, stat ->
                        key(stat.key) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(stat.key, style = MaterialTheme.typography.labelMedium)
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    TextField(
                                        value = stats[index].current,
                                        onValueChange = { stats[index] = stats[index].copy(current = it) },
                                        label = { Text("Current") },
                                        modifier = Modifier.weight(1f),
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        singleLine = true
                                    )
                                    if (stat.key != "TempHP") {
                                        TextField(
                                            value = stats[index].max,
                                            onValueChange = { stats[index] = stats[index].copy(max = it) },
                                            label = { Text("Max") },
                                            modifier = Modifier.weight(1f),
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                            singleLine = true
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Conditions
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.clickable { showingConditionsBrowser = true }
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Conditions", style = MaterialTheme.typography.titleSmall)
                        Icon(Icons.Default.Edit, contentDescription = "Edit conditions", modifier = Modifier.size(16.dp))
                    }
                    
                    if (selectedConditions.isEmpty()) {
                        Text("No active conditions", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        Text(
                            selectedConditions.sorted().joinToString(", "),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        },
        confirmButton = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box {
                    if (draft.id != null) {
                        var showingDeleteConfirm by remember { mutableStateOf(false) }
                        TextButton(onClick = { showingDeleteConfirm = true }) {
                            Text("Delete", color = Color.Red)
                        }

                        if (showingDeleteConfirm) {
                            AlertDialog(
                                onDismissRequest = { showingDeleteConfirm = false },
                                title = { Text("Delete Character?") },
                                text = { Text("This will remove ${name.ifBlank { "this character" }} from the tracker.") },
                                confirmButton = {
                                    TextButton(onClick = {
                                        onDelete(draft.id)
                                        showingDeleteConfirm = false
                                    }) { Text("Delete", color = Color.Red) }
                                },
                                dismissButton = {
                                    TextButton(onClick = { showingDeleteConfirm = false }) { Text("Cancel") }
                                }
                            )
                        }
                    }
                }
                
                Row {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    TextButton(onClick = {
                        draft.name = name
                        draft.useAppInitiativeRoll = useAppInitiativeRoll
                        draft.initiativeBonus = initiativeBonus
                        draft.autoSkipTurn = autoSkipTurn
                        draft.revealStats = revealStats
                        draft.stats = stats.toList()
                        draft.selectedConditions = selectedConditions.toSet()
                        onSave(draft)
                    }) { Text("Save") }
                }
            }
        },
        dismissButton = null
    )
}

@Composable
fun ConditionsBrowserDialog(
    availableConditions: List<ConditionDefinitionDTO>,
    selectedConditions: MutableList<String>,
    rulesetIcon: String?,
    serverURL: String,
    onDismiss: () -> Unit,
    onSave: () -> Unit
) {
    var searchText by remember { mutableStateOf("") }
    val uriHandler = LocalUriHandler.current
    val listState = rememberLazyListState()

    val filteredConditions = remember(searchText, availableConditions) {
        if (searchText.isBlank()) availableConditions
        else availableConditions.filter {
            it.name.contains(searchText, ignoreCase = true) ||
                    (it.description?.contains(searchText, ignoreCase = true) == true)
        }
    }

    val iconUrl = rulesetIcon?.let { icon ->
        if (icon.startsWith("http")) icon
        else "${serverURL.removeSuffix("/")}/rulesets/${icon.removePrefix("/")}"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.fillMaxWidth().fillMaxHeight(0.9f),
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Conditions")
                OutlinedTextField(
                    value = searchText,
                    onValueChange = { searchText = it },
                    placeholder = { Text("Search conditions") },
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = {
                        if (searchText.isNotEmpty()) {
                            IconButton(onClick = { searchText = "" }) {
                                Icon(Icons.Default.Clear, "Clear search")
                            }
                        }
                    },
                    singleLine = true
                )
            }
        },
        text = {
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val trackHeightPx = with(LocalDensity.current) { maxHeight.toPx() }
                
                LazyColumn(
                    state = listState,
                    verticalArrangement = Arrangement.spacedBy(0.dp),
                    modifier = Modifier.fillMaxSize().padding(end = 32.dp)
                ) {
                    // Library section
                    item {
                        Text(
                            "Library", 
                            style = MaterialTheme.typography.labelLarge, 
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }

                    if (filteredConditions.isEmpty()) {
                        item {
                            Text("No matching conditions", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 16.dp))
                        }
                    } else {
                        val sorted = filteredConditions.sortedBy { it.name }
                        itemsIndexed(sorted) { index, condition ->
                            ConditionRow(
                                condition = condition,
                                isSelected = selectedConditions.contains(condition.name),
                                iconUrl = iconUrl,
                                isEven = index % 2 == 0,
                                onToggle = { isSelected ->
                                    if (isSelected) {
                                        if (!selectedConditions.contains(condition.name)) {
                                            selectedConditions.add(condition.name)
                                        }
                                    } else {
                                        selectedConditions.remove(condition.name)
                                    }
                                },
                                onOpenUrl = { uriHandler.openUri(it) }
                            )
                        }
                    }

                    // Selected section
                    if (selectedConditions.isNotEmpty()) {
                        item {
                            Spacer(modifier = Modifier.height(16.dp))
                            Text("Selected", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        }
                        items(selectedConditions.sorted()) { name ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(name, style = MaterialTheme.typography.bodyMedium)
                                IconButton(onClick = { selectedConditions.remove(name) }) {
                                    Icon(Icons.Default.Close, contentDescription = "Remove")
                                }
                            }
                        }
                    }
                }
                
                // Enhanced scrollbar indicator
                val scrollbarInfo by remember {
                    derivedStateOf {
                        val layoutInfo = listState.layoutInfo
                        val total = layoutInfo.totalItemsCount
                        val visibleItems = layoutInfo.visibleItemsInfo
                        val visibleCount = visibleItems.size
                        if (total == 0 || visibleCount >= total) {
                            null
                        } else {
                            val firstItem = visibleItems.firstOrNull()
                            val firstIndex = firstItem?.index ?: 0
                            val firstOffset = firstItem?.offset ?: 0
                            val itemSize = firstItem?.size ?: 1
                            val smoothIndex = firstIndex.toFloat() - (firstOffset.toFloat() / itemSize.coerceAtLeast(1).toFloat())
                            val maxIndex = (total - visibleCount).coerceAtLeast(1)
                            val scrollPercent = (smoothIndex / maxIndex).coerceIn(0f, 1f)
                            val thumbHeightPercent = (visibleCount.toFloat() / total.toFloat()).coerceIn(0.1f, 0.9f)
                            Triple(scrollPercent, thumbHeightPercent, maxIndex)
                        }
                    }
                }

                scrollbarInfo?.let { (scrollPercent, thumbHeightPercent, maxIndex) ->
                    val coroutineScope = rememberCoroutineScope()
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .fillMaxHeight()
                            .width(32.dp) // Large hit target
                            .pointerInput(maxIndex) {
                                awaitEachGesture {
                                    val down = awaitFirstDown()
                                    val scrollToIndex = { pos: androidx.compose.ui.geometry.Offset ->
                                        val p = (pos.y / size.height).coerceIn(0f, 1f)
                                        val total = listState.layoutInfo.totalItemsCount
                                        val target = (p * (total - 1)).toInt().coerceIn(0, (total - 1).coerceAtLeast(0))
                                        coroutineScope.launch {
                                            listState.scrollToItem(target)
                                        }
                                    }
                                    scrollToIndex(down.position)
                                    drag(down.id) { change ->
                                        if (change.positionChange() != androidx.compose.ui.geometry.Offset.Zero) {
                                            change.consume()
                                            scrollToIndex(change.position)
                                        }
                                    }
                                }
                            }
                    ) {
                        // Track
                        Box(
                            modifier = Modifier
                                .align(Alignment.Center)
                                .width(4.dp)
                                .fillMaxHeight()
                                .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.1f), RoundedCornerShape(2.dp))
                        )
                        
                        // Thumb
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .fillMaxHeight(thumbHeightPercent)
                                .width(6.dp)
                                .graphicsLayer {
                                    this.translationY = (trackHeightPx * (1f - thumbHeightPercent)) * scrollPercent
                                }
                                .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onSave) { Text("Done") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun InitiativeEditorDialog(
    character: PlayerViewDTO,
    onDismiss: () -> Unit,
    onSave: (Double?) -> Unit
) {
    var textValue by remember { mutableStateOf(character.initiative?.let { formatInitiative(it) } ?: "") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Set Initiative for ${character.name}") },
        text = {
            TextField(
                value = textValue,
                onValueChange = { textValue = it },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                placeholder = { Text("Enter initiative") },
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(onClick = {
                val newInit = textValue.toDoubleOrNull()
                onSave(newInit)
            }) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun ConditionRow(
    condition: ConditionDefinitionDTO,
    isSelected: Boolean,
    iconUrl: String?,
    isEven: Boolean,
    onToggle: (Boolean) -> Unit,
    onOpenUrl: (String) -> Unit
) {
    val description = condition.description?.trim() ?: ""
    val isUrl = description.startsWith("http://") || description.startsWith("https://")
    val backgroundColor = if (isEven) Color.Transparent else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(backgroundColor)
            .clickable { onToggle(!isSelected) }
            .padding(vertical = 4.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = isSelected, 
            onCheckedChange = { onToggle(it) },
            modifier = Modifier.size(40.dp)
        )
        Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
            Text(condition.name, style = MaterialTheme.typography.bodyMedium)
            if (!isUrl && description.isNotEmpty()) {
                Text(
                    description, 
                    style = MaterialTheme.typography.labelSmall, 
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2
                )
            }
        }
        if (isUrl) {
            IconButton(
                onClick = { onOpenUrl(description) },
                modifier = Modifier.align(Alignment.CenterVertically)
            ) {
                if (iconUrl != null) {
                    AsyncImage(
                        model = iconUrl,
                        contentDescription = "Condition info",
                        modifier = Modifier.size(24.dp).clip(RoundedCornerShape(4.dp))
                    )
                } else {
                    Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Open info")
                }
            }
        }
    }
}

