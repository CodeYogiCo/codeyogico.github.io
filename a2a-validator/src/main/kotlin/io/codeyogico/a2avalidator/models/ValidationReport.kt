package io.codeyogico.a2avalidator.models

data class ValidationResult(
    val checkName: String,
    val passed: Boolean,
    val message: String,
    val details: String? = null,
    val durationMs: Long = 0
)

data class ValidationReport(
    val agentUrl: String,
    val results: List<ValidationResult>,
    val startedAt: Long = System.currentTimeMillis()
) {
    val passed: Boolean get() = results.all { it.passed }
    val failureCount: Int get() = results.count { !it.passed }
    val passCount: Int get() = results.count { it.passed }
    val totalDurationMs: Long get() = results.sumOf { it.durationMs }
}
