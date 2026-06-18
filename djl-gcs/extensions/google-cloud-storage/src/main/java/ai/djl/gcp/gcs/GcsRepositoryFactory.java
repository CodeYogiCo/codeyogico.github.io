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

import ai.djl.repository.Repository;
import ai.djl.repository.RepositoryFactory;

import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;

import java.net.URI;
import java.util.Collections;
import java.util.Set;

/**
 * A {@code GcsRepositoryFactory} is responsible for creating {@link GcsRepository} instances.
 *
 * <p>This factory is registered via the Java {@link java.util.ServiceLoader} mechanism and
 * handles URIs with the {@code gs://} scheme.
 *
 * <p>Authentication uses Application Default Credentials. Set the environment variable
 * {@code GOOGLE_APPLICATION_CREDENTIALS} to a service account key file, or run on GCP where
 * a service account is attached.
 */
public class GcsRepositoryFactory implements RepositoryFactory {

    private Storage storage;

    /** Creates a {@code GcsRepositoryFactory} using Application Default Credentials. */
    public GcsRepositoryFactory() {}

    /**
     * Creates a {@code GcsRepositoryFactory} with a pre-configured {@link Storage} client.
     *
     * @param storage the GCS {@link Storage} client
     */
    public GcsRepositoryFactory(Storage storage) {
        this.storage = storage;
    }

    /** {@inheritDoc} */
    @Override
    public Repository newInstance(String name, URI uri) {
        String scheme = uri.getScheme();
        if (!"gs".equalsIgnoreCase(scheme)) {
            throw new IllegalArgumentException("Invalid GCS URI (expected gs://): " + uri);
        }
        if (storage == null) {
            storage = StorageOptions.getDefaultInstance().getService();
        }
        return new GcsRepository(name, uri, storage);
    }

    /** {@inheritDoc} */
    @Override
    public Set<String> getSupportedScheme() {
        return Collections.singleton("gs");
    }
}
