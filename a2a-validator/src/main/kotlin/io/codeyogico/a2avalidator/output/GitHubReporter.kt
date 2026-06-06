package io.codeyogico.a2avalidator.output

import io.codeyogico.a2avalidator.models.ValidationReport

class GitHubReporter {
    fun report(report: ValidationReport) {
        for (result in report.results) {
            if (!result.passed) {
                println("::error title=A2A [${result.checkName}]::${result.message}")
            }
        }
        if (report.passed) {
            println("::notice title=A2A Validation::All ${report.passCount} checks passed for ${report.agentUrl}")
        } else {
            println("::error title=A2A Validation::${report.failureCount} of ${report.results.size} checks failed for ${report.agentUrl}")
        }
    }
}
