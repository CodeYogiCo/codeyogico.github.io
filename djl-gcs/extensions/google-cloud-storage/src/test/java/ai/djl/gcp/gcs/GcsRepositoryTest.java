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

import ai.djl.repository.Artifact;
import ai.djl.repository.MRL;
import ai.djl.repository.Metadata;
import ai.djl.repository.Repository;

import com.google.api.gax.paging.Page;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.Storage;

import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@SuppressWarnings("unchecked")
public class GcsRepositoryTest {

    @Test
    public void testIsRemote() {
        Storage mockStorage = Mockito.mock(Storage.class);
        GcsRepository repo =
                new GcsRepository("test", URI.create("gs://my-bucket/models/"), mockStorage);
        Assert.assertTrue(repo.isRemote());
    }

    @Test
    public void testLocateReturnsNullWhenBucketEmpty() throws IOException {
        Storage mockStorage = Mockito.mock(Storage.class);
        Page<Blob> emptyPage = Mockito.mock(Page.class);
        Mockito.when(emptyPage.getValues()).thenReturn(Collections.emptyList());
        Mockito.when(
                        mockStorage.list(
                                Mockito.anyString(),
                                Mockito.any(Storage.BlobListOption.class),
                                Mockito.any(Storage.BlobListOption.class),
                                Mockito.any(Storage.BlobListOption.class)))
                .thenReturn(emptyPage);

        GcsRepository repo =
                new GcsRepository("test", URI.create("gs://my-bucket/models/"), mockStorage);
        MRL mrl = repo.model(ai.djl.Application.UNDEFINED, "ai.djl.gcp", "resnet");
        Metadata m = repo.locate(mrl);
        Assert.assertNull(m);
    }

    @Test
    public void testLocateReturnsMetadataWhenObjectsExist() throws IOException {
        Storage mockStorage = Mockito.mock(Storage.class);

        Blob blob1 = Mockito.mock(Blob.class);
        Mockito.when(blob1.getName()).thenReturn("models/resnet/model.pt");
        Mockito.when(blob1.getSize()).thenReturn(1024L);

        Blob blob2 = Mockito.mock(Blob.class);
        Mockito.when(blob2.getName()).thenReturn("models/resnet/config.json");
        Mockito.when(blob2.getSize()).thenReturn(256L);

        Page<Blob> page = Mockito.mock(Page.class);
        Mockito.when(page.getValues()).thenReturn(Arrays.asList(blob1, blob2));
        Mockito.when(
                        mockStorage.list(
                                Mockito.anyString(),
                                Mockito.any(Storage.BlobListOption.class),
                                Mockito.any(Storage.BlobListOption.class),
                                Mockito.any(Storage.BlobListOption.class)))
                .thenReturn(page);

        URI uri = URI.create("gs://my-bucket/models/resnet/");
        GcsRepository repo = new GcsRepository("test", uri, mockStorage);
        MRL mrl = repo.model(ai.djl.Application.UNDEFINED, "ai.djl.gcp", "resnet");
        Metadata m = repo.locate(mrl);
        Assert.assertNotNull(m);

        List<Artifact> artifacts = m.getArtifacts();
        Assert.assertFalse(artifacts.isEmpty());
        Artifact artifact = artifacts.get(0);
        Assert.assertEquals(artifact.getFiles().size(), 2);
    }

    @Test
    public void testRepositoryCreatedViaServiceLoader() {
        // Verify GcsRepositoryFactory is on the classpath and auto-registered
        Repository repo = Repository.newInstance("gcs-test", "gs://dummy-bucket/model/");
        Assert.assertNotNull(repo);
        Assert.assertInstanceOf(repo, GcsRepository.class);
    }
}
