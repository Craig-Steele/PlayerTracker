package com.roll4initiative.android.models

import kotlin.random.Random

object DiceLogic {
    /**
     * Parses a dice expression like "1d20+5", "d8-1", or "20" and returns a roll result.
     * Returns null if the expression is invalid.
     */
    fun roll(expression: String): Int? {
        val trimmed = expression.replace(" ", "").lowercase()
        if (trimmed.isEmpty()) return null

        // Pattern for [count]d[sides][+/-bonus]
        val regex = Regex("""^(\d*)d(\d+)([+-]\d+)?$""")
        val match = regex.matchEntire(trimmed)

        if (match != null) {
            val count = match.groupValues[1].let { if (it.isEmpty()) 1 else it.toInt() }
            val sides = match.groupValues[2].toInt()
            val bonus = match.groupValues[3].let { if (it.isEmpty()) 0 else it.toInt() }

            if (sides <= 0 || count <= 0) return null
            
            var total = 0
            repeat(count) {
                total += Random.nextInt(1, sides + 1)
            }
            return total + bonus
        }

        // Try parsing as a plain number (bonus only)
        return trimmed.toIntOrNull()
    }
}
