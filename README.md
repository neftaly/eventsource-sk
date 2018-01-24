```
curl 'http://localhost:3000/signalk/v1/api/' -H 'Accept: text/event-stream' -H 'Connection: keep-alive'
```


```js
const merge = require('lodash.merge')
let state = {};
new EventSource('http://localhost:3000/signalk/v1/api/').onmessage = function(event) {
  const data = JSON.stringify(event.data);
  state = merge(state, data)
  console.log('New state:', state)
};
```

