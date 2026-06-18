# Google Cloud Storage extension for DJL

This extension enables DJL to load models directly from [Google Cloud Storage](https://cloud.google.com/storage) (GCS) using the `gs://` URI scheme.

## Dependency

Add the following to your project:

### Gradle

```gradle
implementation("ai.djl.gcp:google-cloud-storage:0.37.0")
```

### Maven

```xml
<dependency>
    <groupId>ai.djl.gcp</groupId>
    <artifactId>google-cloud-storage</artifactId>
    <version>0.37.0</version>
</dependency>
```

## Authentication

Authentication uses [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials):

- **Local development**: run `gcloud auth application-default login`
- **GCP compute**: attach a service account to the VM/pod
- **Service account key**: set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`

## Usage

Load a model from GCS by providing a `gs://` URI:

```java
// The extension is auto-discovered via ServiceLoader — no manual registration needed.
Criteria<Image, Classifications> criteria =
        Criteria.builder()
                .setTypes(Image.class, Classifications.class)
                .optModelUrls("gs://my-bucket/models/resnet50/")
                .optTranslatorFactory(new ImageClassificationTranslatorFactory())
                .build();

ZooModel<Image, Classifications> model = criteria.loadModel();
```

### URI formats

| URI | Description |
|-----|-------------|
| `gs://bucket/path/to/model/` | Directory containing model files |
| `gs://bucket/model.zip` | Zipped model archive (auto-extracted) |
| `gs://bucket/model.tar.gz` | Tar-gzip archive (auto-extracted) |

### Query parameters

Append parameters after `?` to customise the loaded artifact:

| Parameter | Description |
|-----------|-------------|
| `artifact_id` | Override the artifact identifier (defaults to directory/file name) |
| `model_name` | Override the model name used inside DJL |

Example: `gs://my-bucket/models/?artifact_id=resnet&model_name=my-resnet`

## Using a custom Storage client

If you need custom credentials, retry policies, or project settings you can supply your own `Storage` instance:

```java
Storage storage = StorageOptions.newBuilder()
        .setProjectId("my-project")
        .setCredentials(ServiceAccountCredentials.fromStream(keyStream))
        .build()
        .getService();

GcsRepositoryFactory factory = new GcsRepositoryFactory(storage);
Repository repo = factory.newInstance("my-repo", URI.create("gs://my-bucket/models/"));

Criteria<Image, Classifications> criteria =
        Criteria.builder()
                .setTypes(Image.class, Classifications.class)
                .optRepository(repo)
                .build();
```
