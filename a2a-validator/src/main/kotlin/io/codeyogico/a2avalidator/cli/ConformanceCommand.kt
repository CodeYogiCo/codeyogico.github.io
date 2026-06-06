package io.codeyogico.a2avalidator.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.ProgramResult
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.long
import io.codeyogico.a2avalidator.models.ValidationReport
import io.codeyogico.a2avalidator.validators.ConformanceValidator

class ConformanceCommand : CliktCommand(
    name = "conformance",
    help = "Run A2A protocol conformance tests (error handling, content-type, malformed input rejection)"
) {
    private val url by argument(help = "A2A agent endpoint URL")
    private val output by option("--output", "-o", help = "Output format: console | junit | github").default("console")
    private val junitOutput by option("--junit-output", help = "Path for JUnit XML report").default("a2a-conformance-report.xml")
    private val timeout by option("--timeout", "-t", help = "Request timeout in seconds").long().default(30)

    override fun run() {
        val results = ConformanceValidator(buildHttpClient(timeout), sharedGson).validate(url)
        val report = ValidationReport(agentUrl = url, results = results)
        report.render(output, junitOutput)
        if (!report.passed) throw ProgramResult(1)
    }
}
