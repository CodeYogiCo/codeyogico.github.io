plugins {
    ai.djl.javaProject
    ai.djl.publish
}

group = "ai.djl.gcp"

dependencies {
    api(project(":api"))
    api(libs.google.cloud.storage)

    testImplementation(libs.testng)
    testImplementation(libs.apache.log4j.slf4j)
    testImplementation(libs.mockito)
}

publishing {
    publications {
        named<MavenPublication>("maven") {
            pom {
                name = "Google Cloud Storage integration for DJL"
                description = "Google Cloud Storage model repository integration for DJL"
                url = "http://www.djl.ai/extensions/${project.name}"
            }
        }
    }
}
