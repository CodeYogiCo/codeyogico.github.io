package io.codeyogico.a2avalidator.cli

import com.google.gson.Gson
import io.codeyogico.a2avalidator.models.ValidationReport
import io.codeyogico.a2avalidator.output.ConsoleReporter
import io.codeyogico.a2avalidator.output.GitHubReporter
import io.codeyogico.a2avalidator.output.JUnitReporter
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

fun buildHttpClient(timeoutSecs: Long): OkHttpClient =
    OkHttpClient.Builder()
        .callTimeout(timeoutSecs, TimeUnit.SECONDS)
        .connectTimeout(timeoutSecs, TimeUnit.SECONDS)
        .readTimeout(timeoutSecs, TimeUnit.SECONDS)
        .build()

val sharedGson: Gson = Gson()

fun ValidationReport.render(output: String, junitPath: String) {
    when (output) {
        "github" -> {
            GitHubReporter().report(this)
            ConsoleReporter().report(this)
        }
        "junit" -> {
            ConsoleReporter().report(this)
            JUnitReporter().report(this, junitPath)
            println("JUnit report written to: $junitPath")
        }
        else -> ConsoleReporter().report(this)
    }
}
