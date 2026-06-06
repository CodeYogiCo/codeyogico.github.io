package io.codeyogico.a2avalidator.validators

import com.google.gson.Gson
import com.google.gson.JsonObject
import io.codeyogico.a2avalidator.models.ValidationResult
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class ConformanceValidator(private val client: OkHttpClient, private val gson: Gson) {

    fun validate(agentUrl: String): List<ValidationResult> {
        val url = agentUrl.trimEnd('/')
        return buildList {
            addAll(testUnknownMethod(url))
            addAll(testMalformedJson(url))
            addAll(testMissingRequiredParams(url))
            addAll(testResponseContentType(url))
        }
    }

    private fun post(url: String, body: String, contentType: String = "application/json"): Pair<Int, JsonObject?> {
        val response = client.newCall(
            Request.Builder()
                .url(url)
                .post(body.toRequestBody(contentType.toMediaType()))
                .build()
        ).execute()
        val json = response.body?.string()?.let {
            runCatching { gson.fromJson(it, JsonObject::class.java) }.getOrNull()
        }
        return response.code to json
    }

    private fun testUnknownMethod(url: String): List<ValidationResult> = try {
        val (_, json) = post(url, """{"jsonrpc":"2.0","id":"cv-1","method":"tasks/unknown_xyz","params":{}}""")
        val hasError = json?.has("error") == true
        listOf(ValidationResult(
            checkName = "conformance/unknown-method-returns-error",
            passed = hasError,
            message = if (hasError) "Returns JSON-RPC error object for unknown method"
                      else "Should return a JSON-RPC 'error' object for unknown methods"
        ))
    } catch (e: Exception) {
        listOf(ValidationResult("conformance/unknown-method-returns-error", false, "Request failed: ${e.message}"))
    }

    private fun testMalformedJson(url: String): List<ValidationResult> = try {
        val (code, json) = post(url, "not json {{ at all")
        val handled = code == 400 || json?.has("error") == true
        listOf(ValidationResult(
            checkName = "conformance/malformed-json-rejected",
            passed = handled,
            message = if (handled) "Correctly rejects malformed JSON (HTTP $code)"
                      else "Should return HTTP 400 or JSON-RPC error for malformed request body"
        ))
    } catch (e: Exception) {
        listOf(ValidationResult("conformance/malformed-json-rejected", false, "Request failed: ${e.message}"))
    }

    private fun testMissingRequiredParams(url: String): List<ValidationResult> = try {
        val (_, json) = post(url, """{"jsonrpc":"2.0","id":"cv-3","method":"tasks/send","params":{}}""")
        val rejected = json?.has("error") == true
        listOf(ValidationResult(
            checkName = "conformance/missing-params-rejected",
            passed = rejected,
            message = if (rejected) "Returns JSON-RPC error when 'message' param is absent from tasks/send"
                      else "Should return a JSON-RPC error when required 'message' param is missing"
        ))
    } catch (e: Exception) {
        listOf(ValidationResult("conformance/missing-params-rejected", false, "Request failed: ${e.message}"))
    }

    private fun testResponseContentType(url: String): List<ValidationResult> = try {
        val response = client.newCall(
            Request.Builder()
                .url(url)
                .post("""{"jsonrpc":"2.0","id":"cv-4","method":"tasks/send","params":{}}"""
                    .toRequestBody("application/json".toMediaType()))
                .build()
        ).execute()
        val ct = response.header("Content-Type") ?: ""
        val isJson = ct.contains("application/json")
        listOf(ValidationResult(
            checkName = "conformance/response-content-type",
            passed = isJson,
            message = if (isJson) "Response Content-Type is application/json"
                      else "Expected application/json Content-Type, got: '$ct'"
        ))
    } catch (e: Exception) {
        listOf(ValidationResult("conformance/response-content-type", false, "Request failed: ${e.message}"))
    }
}
