# MorphCloud Typescript SDK

## Overview

MorphCloud is a platform designed to spin up remote AI devboxes we call runtimes.
It provides a suite of code intelligence tools and a Typescript SDK to manage, create, delete, and interact with runtime instances.

## Setup Guide

### Prerequisites

Go to [https://cloud.morph.so](https://cloud.morph.so/web/api-keys), log in with the provided credentials and create an API key.

### Installation

```
npm install morphcloud
```

## Typescript API

The SDK provides a Typescript API to interact with the MorphCloud API.

The following example creates a minimal vm snapshot, starts and instance then sets up a simple HTTP server and makes an HTTP request to it.

```ts
import { MorphCloudClient } from "morphcloud";

// Initialize the client
const client = new MorphCloudClient({
    apiKey: 'your API key'
});

(async () => {
    // Create a snapshot with minimal resources
    const snapshot = await client.snapshots.create({
        vcpus: 1,
        memory: 128,
        diskSize: 700,
        imageId: "morphvm-minimal"
    });

    // Start an instance from the snapshot
    const instance = await client.instances.start({
        snapshotId: snapshot.id
    });

    // Wait for instance to be ready
    await instance.waitUntilReady(10);

    // Connect via SSH
    const ssh = await instance.ssh();

    // Set up a simple HTTP server
    ssh.execCommand("python3 -m http.server 8000");

    // Expose the HTTP service
    const service = await instance.exposeHttpService('web', 8000);

    // Give python a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test connecting to the HTTP services
    let url = service.url
    let res = await fetch(url);
    console.log(`${url}: ${res.status}`);

})()
```
