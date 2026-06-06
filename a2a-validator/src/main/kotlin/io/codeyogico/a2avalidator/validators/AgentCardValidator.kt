package io.codeyogico.a2avalidator.validators

import com.google.gson.Gson
import com.google.gson.JsonObject
import io.codeyogico.a2avalidator.models.ValidationResult
import okhttp3.OkHttpClient
import okhttp3.Request

class AgentCardValidator(private val client: OkHttpClient, private val gson: Gson) {

    private val requiredFields = listOf("name", "url", "version")

    fun validate(baseUrl: String): List<ValidationResult> {
        val url = baseUrl.trimEnd('/')
        val results = mutableListOf<ValidationResult>()

        val (fetchResult, body) = fetchCard(url)
        results.add(fetchResult)
        if (!fetchResult.passed || body == null) return results

        val (parseResult, card) = parseCard(body)
        results.add(parseResult)
        if (!parseResult.passed || card == null) return results

        results.addAll(checkRequiredFields(card))
        results.addAll(checkUrlField(card))
        results.addAll(checkCapabilities(card))

        return results
    }

    private fun fetchCard(baseUrl: String): Pair<ValidationResult, String?> {
        val start = System.currentTimeMillis()
        return try {
            val response = client.newCall(
                Request.Builder().url("$baseUrl/.well-known/agent-card.json").get().build()
            ).execute()
            val duration = System.currentTimeMillis() - start
            val body = response.body?.string()
            if (response.isSuccessful) {
                ValidationResult("agent-card/fetch", true, "Agent card endpoint returns HTTP ${response.code}", durationMs = duration) to body
            } else {
                ValidationResult("agent-card/fetch", false, "Agent card returned HTTP ${response.code}", durationMs = duration) to null
            }
        } catch (e: Exception) {
            val duration = System.currentTimeMillis() - start
            ValidationResult("agent-card/fetch", false, "Failed to reach /.well-known/agent-card.json: ${e.message}", durationMs = duration) to null
        }
    }

    private fun parseCard(body: String): Pair<ValidationResult, JsonObject?> {
        return try {
            val card = gson.fromJson(body, JsonObject::class.java)
            ValidationResult("agent-card/parse", true, "Agent card is valid JSON") to card
        } catch (e: Exception) {
            ValidationResult("agent-card/parse", false, "Agent card is not valid JSON: ${e.message}") to null
        }
    }

    private fun checkRequiredFields(card: JsonObject): List<ValidationResult> =
        requiredFields.map { field ->
            val present = card.has(field) && !card.get(field).isJsonNull
            ValidationResult(
                checkName = "agent-card/required-field/$field",
                passed = present,
                message = if (present) "Required field '$field' is present"
                          else "Missing required field '$field'"
            )
        }

    private fun checkUrlField(card: JsonObject): List<ValidationResult> {
        val urlElement = card.takeIf { it.has("url") }?.get("url") ?: return emptyList()
        val agentUrl = runCatching { urlElement.asString }.getOrNull() ?: return emptyList()
        val valid = agentUrl.startsWith("http://") || agentUrl.startsWith("https://")
        return listOf(
            ValidationResult(
                checkName = "agent-card/url-format",
                passed = valid,
                message = if (valid) "Agent 'url' field is a valid HTTP/HTTPS URL"
                          else "Agent 'url' value '$agentUrl' is not a valid HTTP/HTTPS URL"
            )
        )
    }

    private fun checkCapabilities(card: JsonObject): List<ValidationResult> {
        if (!card.has("capabilities")) return emptyList()
        val caps = card.getAsJsonObject("capabilities")
        return listOf(
            ValidationResult(
                checkName = "agent-card/capabilities",
                passed = true,
                message = "Capabilities block is present",
                details = caps.toString()
            )
        )
    }
}
