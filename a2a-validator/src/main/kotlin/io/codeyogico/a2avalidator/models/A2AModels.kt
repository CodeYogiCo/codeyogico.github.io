package io.codeyogico.a2avalidator.models

data class JsonRpcRequest(
    val jsonrpc: String = "2.0",
    val id: String,
    val method: String,
    val params: Any
)

data class TaskSendParams(
    val id: String,
    val message: A2AMessage
)

data class A2AMessage(
    val role: String = "user",
    val parts: List<A2APart>
)

data class A2APart(
    val type: String = "text",
    val text: String
)
