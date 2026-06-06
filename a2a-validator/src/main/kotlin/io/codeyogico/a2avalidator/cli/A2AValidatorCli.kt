package io.codeyogico.a2avalidator.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.subcommands

class A2AValidatorCli : CliktCommand(
    name = "a2a-validator",
    help = "Validate A2A protocol compliance of AI agents.\n\nDesigned for CI/CD pipelines: exits non-zero on failure, supports JUnit XML and GitHub Actions annotation output."
) {
    init {
        subcommands(
            ValidateCommand(),
            HealthCommand(),
            AgentCardCommand(),
            RoundTripCommand(),
            ConformanceCommand()
        )
    }

    override fun run() {}
}
