package io.codeyogico.a2avalidator.output

import io.codeyogico.a2avalidator.models.ValidationReport
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class JUnitReporter {

    fun report(report: ValidationReport, outputPath: String) {
        val timestamp = Instant.ofEpochMilli(report.startedAt)
            .atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)

        val xml = buildString {
            appendLine("""<?xml version="1.0" encoding="UTF-8"?>""")
            appendLine(
                """<testsuite name="A2A Protocol Validation" tests="${report.results.size}" """ +
                """failures="${report.failureCount}" time="${report.totalDurationMs / 1000.0}" """ +
                """timestamp="$timestamp" hostname="${xml(report.agentUrl)}">"""
            )
            for (result in report.results) {
                append("""  <testcase classname="a2a.validator" name="${xml(result.checkName)}" time="${result.durationMs / 1000.0}">""")
                if (!result.passed) {
                    appendLine()
                    appendLine("""    <failure message="${xml(result.message)}">${xml(result.details ?: result.message)}</failure>""")
                    append("  ")
                }
                appendLine("</testcase>")
            }
            appendLine("</testsuite>")
        }

        File(outputPath).writeText(xml)
    }

    private fun xml(s: String): String = s
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")
}
