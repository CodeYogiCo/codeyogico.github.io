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

import com.google.cloud.storage.Storage;

import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URI;
import java.util.Set;

public class GcsRepositoryFactoryTest {

    @Test
    public void testGetSupportedScheme() {
        GcsRepositoryFactory factory = new GcsRepositoryFactory();
        Set<String> schemes = factory.getSupportedScheme();
        Assert.assertEquals(schemes.size(), 1);
        Assert.assertTrue(schemes.contains("gs"));
    }

    @Test
    public void testNewInstanceWithMockStorage() {
        Storage mockStorage = Mockito.mock(Storage.class);
        GcsRepositoryFactory factory = new GcsRepositoryFactory(mockStorage);
        URI uri = URI.create("gs://my-bucket/models/resnet");
        Repository repo = factory.newInstance("test-repo", uri);
        Assert.assertNotNull(repo);
        Assert.assertInstanceOf(repo, GcsRepository.class);
    }

    @Test(expectedExceptions = IllegalArgumentException.class)
    public void testNewInstanceRejectsNonGcsUri() {
        Storage mockStorage = Mockito.mock(Storage.class);
        GcsRepositoryFactory factory = new GcsRepositoryFactory(mockStorage);
        factory.newInstance("bad", URI.create("s3://bucket/key"));
    }
}
