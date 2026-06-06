package io.codeyogico.a2avalidator.output

import io.codeyogico.a2avalidator.models.ValidationReport

class ConsoleReporter {
    private val green = "[32m"
    private val red = "[31m"
    private val yellow = "[33m"
    private val bold = "[1m"
    private val reset = "[0m"

    fun report(report: ValidationReport) {
        println()
        println("${bold}A2A Validation Report$reset")
        println("─".repeat(65))
        println("Agent: ${report.agentUrl}")
        println()

        for (result in report.results) {
            val (color, icon) = if (result.passed) green to "✓" else red to "✗"
            val nameCol = result.checkName.padEnd(48)
            println("  $color$icon$reset $nameCol ${result.message}")
            result.details?.let { println("     ${yellow}↳$reset $it") }
        }

        println()
        println("─".repeat(65))
        val failPart = if (report.failureCount > 0) "$red${report.failureCount} failed$reset" else "0 failed"
        println("Result: ${bold}${green}${report.passCount} passed$reset, $failPart  │  ${report.totalDurationMs}ms total")
        println()
    }
}
