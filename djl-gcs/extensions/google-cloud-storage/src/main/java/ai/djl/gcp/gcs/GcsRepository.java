/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 * with the License. A copy of the License is located at
 *
 * http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
 * OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 */
package ai.djl.gcp.gcs;

import ai.djl.Application;
import ai.djl.repository.AbstractRepository;
import ai.djl.repository.Artifact;
import ai.djl.repository.FilenameUtils;
import ai.djl.repository.MRL;
import ai.djl.repository.Metadata;
import ai.djl.repository.Repository;
import ai.djl.repository.zoo.DefaultModelZoo;
import ai.djl.util.Progress;
import ai.djl.util.Utils;

import com.google.api.gax.paging.Page;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.channels.Channels;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A {@code GcsRepository} is a {@link Repository} located on Google Cloud Storage.
 *
 * <p>To load a model from GCS, use a URI in the form {@code gs://bucket-name/path/to/model}.
 *
 * @see Repository
 */
public class GcsRepository extends AbstractRepository {

    private static final Logger logger = LoggerFactory.getLogger(GcsRepository.class);

    private final Storage storage;
    private final String bucket;
    private String prefix;
    private final String artifactId;
    private final String modelName;

    private Metadata metadata;
    private boolean resolved;

    GcsRepository(String name, URI uri, Storage storage) {
        super(name, uri);
        this.storage = storage;

        bucket = uri.getHost();
        prefix = uri.getPath();
        if (!prefix.isEmpty()) {
            prefix = prefix.substring(1); // strip leading '/'
        }
        boolean isArchive = FilenameUtils.isArchiveFile(prefix);
        if (!isArchive && !prefix.isEmpty() && !prefix.endsWith("/")) {
            prefix += '/';
        }

        modelName = arguments.getOrDefault("model_name", deriveArtifactId(isArchive));
        String argArtifactId = arguments.get("artifact_id");
        artifactId = argArtifactId != null ? argArtifactId : deriveArtifactId(isArchive);
    }

    private String deriveArtifactId(boolean isArchive) {
        if (prefix.isEmpty()) {
            return bucket;
        }
        Path path = Paths.get(prefix);
        Path fileName = path.getFileName();
        if (fileName == null) {
            throw new AssertionError("Unexpected null filename for prefix: " + prefix);
        }
        String name = fileName.toString();
        return isArchive ? FilenameUtils.getNamePart(name) : name;
    }

    /** {@inheritDoc} */
    @Override
    public boolean isRemote() {
        return true;
    }

    /** {@inheritDoc} */
    @Override
    public Metadata locate(MRL mrl) throws IOException {
        return getMetadata();
    }

    /** {@inheritDoc} */
    @Override
    public Artifact resolve(MRL mrl, Map<String, String> filter) throws IOException {
        Metadata m = locate(mrl);
        if (m == null) {
            return null;
        }
        List<Artifact> artifacts = m.getArtifacts();
        if (artifacts.isEmpty()) {
            return null;
        }
        return artifacts.get(0);
    }

    /** {@inheritDoc} */
    @Override
    protected void download(Path tmp, URI baseUri, Artifact.Item item, Progress progress)
            throws IOException {
        String objectName = item.getUri();
        logger.debug("Downloading artifact from: gs://{}/{} ...", bucket, objectName);
        BlobId blobId = BlobId.of(bucket, objectName);
        Blob blob = storage.get(blobId);
        if (blob == null) {
            throw new IOException("GCS object not found: gs://" + bucket + "/" + objectName);
        }
        try (InputStream is = Channels.newInputStream(blob.reader())) {
            save(is, tmp, item, progress);
        } catch (StorageException e) {
            throw new IOException("Failed to download from GCS: gs://" + bucket + "/" + objectName, e);
        }
    }

    /** {@inheritDoc} */
    @Override
    public List<MRL> getResources() {
        try {
            Metadata m = getMetadata();
            if (m != null && !m.getArtifacts().isEmpty()) {
                MRL mrl = model(Application.UNDEFINED, m.getGroupId(), m.getArtifactId());
                return Collections.singletonList(mrl);
            }
        } catch (IOException e) {
            logger.warn("Failed to scan GCS bucket: {}", bucket, e);
        }
        return Collections.emptyList();
    }

    private synchronized Metadata getMetadata() throws IOException {
        if (resolved) {
            return metadata;
        }
        try {
            resolved = true;
            Artifact artifact = listFiles();
            if (artifact == null) {
                logger.debug("No objects found in GCS bucket: {}", bucket);
                return null;
            }
            metadata = new Metadata.MatchAllMetadata();
            String hash = Utils.hash("gs://" + bucket + '/' + prefix);
            MRL mrl = model(Application.UNDEFINED, DefaultModelZoo.GROUP_ID, hash);
            metadata.setRepositoryUri(mrl.toURI());
            metadata.setArtifactId(artifactId);
            metadata.setArtifacts(Collections.singletonList(artifact));
            return metadata;
        } catch (StorageException e) {
            throw new IOException("Failed to scan GCS bucket: " + bucket, e);
        }
    }

    private Artifact listFiles() {
        Storage.BlobListOption[] options = prefix.isEmpty()
                ? new Storage.BlobListOption[]{
                    Storage.BlobListOption.pageSize(100),
                    Storage.BlobListOption.delimiter("/")
                }
                : new Storage.BlobListOption[]{
                    Storage.BlobListOption.pageSize(100),
                    Storage.BlobListOption.prefix(prefix),
                    Storage.BlobListOption.delimiter("/")
                };

        Page<Blob> page = storage.list(bucket, options);
        Iterable<Blob> blobs = page.getValues();

        Artifact artifact = new Artifact();
        artifact.setName(modelName);
        artifact.getArguments().putAll(arguments);
        Map<String, Artifact.Item> files = new ConcurrentHashMap<>();

        for (Blob blob : blobs) {
            String key = blob.getName();
            if (!key.endsWith("/")) {
                Artifact.Item item = new Artifact.Item();
                item.setUri(key);
                item.setSize(blob.getSize());
                item.setArtifact(artifact);
                if ("dir".equals(item.getType())) {
                    item.setName("");
                }
                files.put(key, item);
            }
        }

        if (files.isEmpty()) {
            return null;
        }
        artifact.setFiles(files);
        return artifact;
    }
}
