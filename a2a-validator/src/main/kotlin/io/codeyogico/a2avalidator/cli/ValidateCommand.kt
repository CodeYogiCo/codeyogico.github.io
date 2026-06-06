package io.codeyogico.a2avalidator.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.ProgramResult
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.long
import io.codeyogico.a2avalidator.models.ValidationReport
import io.codeyogico.a2avalidator.validators.*

class ValidateCommand : CliktCommand(
    name = "validate",
    help = "Run all A2A validation checks: health, agent card, round-trip, and conformance.\n\nExits with code 1 if any check fails."
) {
    private val url by argument(help = "Base URL of the A2A agent (e.g. http://localhost:8080)")
    private val output by option("--output", "-o", help = "Output format: console | junit | github").default("console")
    private val junitOutput by option("--junit-output", help = "Path for JUnit XML report").default("a2a-validation-report.xml")
    private val timeout by option("--timeout", "-t", help = "Request timeout in seconds").long().default(30)
    private val testMessage by option("--test-message", help = "Message body for round-trip test").default("Hello, this is a CI/CD validation test.")
    private val skipRoundTrip by option("--skip-round-trip", help = "Skip round-trip send/receive test").flag()
    private val skipConformance by option("--skip-conformance", help = "Skip protocol conformance tests").flag()

    override fun run() {
        val client = buildHttpClient(timeout)
        val gson = sharedGson

        val results = buildList {
            addAll(HealthValidator(client).validate(url))
            addAll(AgentCardValidator(client, gson).validate(url))
            if (!skipRoundTrip) addAll(RoundTripValidator(client, gson).validate(url, testMessage))
            if (!skipConformance) addAll(ConformanceValidator(client, gson).validate(url))
        }

        val report = ValidationReport(agentUrl = url, results = results)
        report.render(output, junitOutput)

        if (!report.passed) throw ProgramResult(1)
    }
}
