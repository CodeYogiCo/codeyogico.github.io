package io.codeyogico.a2avalidator.validators

import io.codeyogico.a2avalidator.models.ValidationResult
import okhttp3.OkHttpClient
import okhttp3.Request

class HealthValidator(private val client: OkHttpClient) {

    fun validate(baseUrl: String): List<ValidationResult> {
        val url = baseUrl.trimEnd('/')
        val start = System.currentTimeMillis()
        return try {
            val response = client.newCall(
                Request.Builder().url("$url/.well-known/agent-card.json").get().build()
            ).execute()
            val duration = System.currentTimeMillis() - start
            val passed = response.code in 200..299
            listOf(
                ValidationResult(
                    checkName = "health/reachability",
                    passed = passed,
                    message = if (passed) "Agent is reachable (HTTP ${response.code}, ${duration}ms)"
                              else "Agent returned unexpected HTTP ${response.code}",
                    durationMs = duration
                )
            )
        } catch (e: Exception) {
            listOf(
                ValidationResult(
                    checkName = "health/reachability",
                    passed = false,
                    message = "Connection failed: ${e.message}",
                    durationMs = System.currentTimeMillis() - start
                )
            )
        }
    }
}
