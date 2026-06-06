package io.codeyogico.a2avalidator.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.ProgramResult
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.long
import io.codeyogico.a2avalidator.models.ValidationReport
import io.codeyogico.a2avalidator.validators.AgentCardValidator

class AgentCardCommand : CliktCommand(
    name = "agent-card",
    help = "Validate the A2A agent card at /.well-known/agent-card.json (required fields, URL format, JSON validity)"
) {
    private val url by argument(help = "Base URL of the A2A agent")
    private val output by option("--output", "-o", help = "Output format: console | junit | github").default("console")
    private val junitOutput by option("--junit-output", help = "Path for JUnit XML report").default("a2a-agent-card-report.xml")
    private val timeout by option("--timeout", "-t", help = "Request timeout in seconds").long().default(30)

    override fun run() {
        val results = AgentCardValidator(buildHttpClient(timeout), sharedGson).validate(url)
        val report = ValidationReport(agentUrl = url, results = results)
        report.render(output, junitOutput)
        if (!report.passed) throw ProgramResult(1)
    }
}
