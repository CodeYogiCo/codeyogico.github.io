package io.codeyogico.a2avalidator.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.ProgramResult
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.long
import io.codeyogico.a2avalidator.models.ValidationReport
import io.codeyogico.a2avalidator.validators.HealthValidator

class HealthCommand : CliktCommand(
    name = "health",
    help = "Check if an A2A agent is reachable and responds to /.well-known/agent-card.json"
) {
    private val url by argument(help = "Base URL of the A2A agent")
    private val output by option("--output", "-o", help = "Output format: console | github").default("console")
    private val timeout by option("--timeout", "-t", help = "Request timeout in seconds").long().default(10)

    override fun run() {
        val results = HealthValidator(buildHttpClient(timeout)).validate(url)
        val report = ValidationReport(agentUrl = url, results = results)
        report.render(output, "")
        if (!report.passed) throw ProgramResult(1)
    }
}
