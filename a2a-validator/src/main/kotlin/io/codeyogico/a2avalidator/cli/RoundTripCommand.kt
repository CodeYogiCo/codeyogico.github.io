package io.codeyogico.a2avalidator.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.ProgramResult
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.long
import io.codeyogico.a2avalidator.models.ValidationReport
import io.codeyogico.a2avalidator.validators.RoundTripValidator

class RoundTripCommand : CliktCommand(
    name = "round-trip",
    help = "Send a tasks/send request and validate the JSON-RPC response envelope"
) {
    private val url by argument(help = "A2A agent endpoint URL")
    private val message by option("--message", "-m", help = "Test message to send").default("Hello, this is a validation test.")
    private val output by option("--output", "-o", help = "Output format: console | junit | github").default("console")
    private val junitOutput by option("--junit-output", help = "Path for JUnit XML report").default("a2a-round-trip-report.xml")
    private val timeout by option("--timeout", "-t", help = "Request timeout in seconds").long().default(30)

    override fun run() {
        val results = RoundTripValidator(buildHttpClient(timeout), sharedGson).validate(url, message)
        val report = ValidationReport(agentUrl = url, results = results)
        report.render(output, junitOutput)
        if (!report.passed) throw ProgramResult(1)
    }
}
