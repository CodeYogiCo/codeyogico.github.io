package io.codeyogico.a2avalidator.validators

import com.google.gson.Gson
import com.google.gson.JsonObject
import io.codeyogico.a2avalidator.models.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class RoundTripValidator(private val client: OkHttpClient, private val gson: Gson) {

    fun validate(agentUrl: String, testMessage: String): List<ValidationResult> {
        val url = agentUrl.trimEnd('/')
        val taskId = "cicd-validate-${System.currentTimeMillis()}"
        val payload = gson.toJson(
            JsonRpcRequest(
                id = taskId,
                method = "tasks/send",
                params = TaskSendParams(
                    id = taskId,
                    message = A2AMessage(parts = listOf(A2APart(text = testMessage)))
                )
            )
        )

        val start = System.currentTimeMillis()
        val (httpCode, body) = try {
            val resp = client.newCall(
                Request.Builder()
                    .url(url)
                    .post(payload.toRequestBody("application/json".toMediaType()))
                    .build()
            ).execute()
            resp.code to resp.body?.string()
        } catch (e: Exception) {
            return listOf(
                ValidationResult("round-trip/send", false, "Request failed: ${e.message}",
                    durationMs = System.currentTimeMillis() - start)
            )
        }
        val duration = System.currentTimeMillis() - start

        val results = mutableListOf<ValidationResult>()
        val httpOk = httpCode in 200..299
        results.add(ValidationResult(
            checkName = "round-trip/http-success",
            passed = httpOk,
            message = if (httpOk) "Agent accepted task (HTTP $httpCode, ${duration}ms)"
                      else "Agent rejected task with HTTP $httpCode",
            durationMs = duration
        ))

        if (body == null) {
            results.add(ValidationResult("round-trip/response-body", false, "Response body was empty"))
            return results
        }

        val json = try {
            gson.fromJson(body, JsonObject::class.java)
        } catch (e: Exception) {
            results.add(ValidationResult("round-trip/response-json", false, "Response is not valid JSON: ${e.message}"))
            return results
        }
        results.add(ValidationResult("round-trip/response-json", true, "Response is valid JSON"))

        val hasJsonRpc = json.has("jsonrpc") && runCatching { json.get("jsonrpc").asString }.getOrNull() == "2.0"
        results.add(ValidationResult(
            checkName = "round-trip/jsonrpc-envelope",
            passed = hasJsonRpc,
            message = if (hasJsonRpc) "Response contains jsonrpc: \"2.0\""
                      else "Response missing or incorrect 'jsonrpc' field (expected \"2.0\")"
        ))

        val hasResultOrError = json.has("result") || json.has("error")
        results.add(ValidationResult(
            checkName = "round-trip/response-structure",
            passed = hasResultOrError,
            message = if (hasResultOrError) "Response contains 'result' or 'error' field"
                      else "Response missing both 'result' and 'error' fields"
        ))

        return results
    }
}
