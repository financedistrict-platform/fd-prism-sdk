---
sidebar_position: 1
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Welcome to Prism SDK

Multi-language SDK for the **x402 payment protocol**.

## Quick Start

<Tabs groupId="language">
<TabItem value="typescript" label="TypeScript" default>

```typescript
import express from 'express';
import { prismPaymentMiddleware } from 'prism-express-sdk';

const app = express();

app.use(prismPaymentMiddleware(
  { apiKey: 'dev-key-123', useSandbox: true },
  { '/api/weather': { price: 0.001, description: 'Weather API' } }
));

app.listen(3000);
```

[Get Started](/docs/sdk/typescript)

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
// Coming soon
```

</TabItem>
<TabItem value="python" label="Python">

```python
# Coming soon
```

</TabItem>
</Tabs>
