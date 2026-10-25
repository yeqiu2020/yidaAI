#!/usr/bin/env node
'use strict';
// Compatibility entry: security is now enforced inside the default server.
if (require.main === module) require('../../form_creator/scripts/sync_server').startSyncServer();
