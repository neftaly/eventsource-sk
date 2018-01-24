const R = require('ramda')
const { name, description } = require('./package.json')
const debug = require('debug')(name)

module.exports = function (app) {
  'use strict'

  const pathPrefix = '/signalk'
  const versionPrefix = '/v1'
  const apiPathPrefix = pathPrefix + versionPrefix + '/api/'

  let active = true

  return {
    id: name,
    name,
    description,
    schema: { type: 'object', properties: {} },

    start: function () {
      active = true

      app.get(apiPathPrefix + '*', function (req, res, next) {
        if (!active) return next()

        // Only run on SSE connections
        const { accept = '' } = req.headers
        if (!accept.startsWith('text/event-stream')) return next()

        // Setup connection
        req.socket.setKeepAlive(true)
        req.socket.setTimeout(0)
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Connection', 'keep-alive')
        res.write('retry: 2000\n')
        debug('new client')

        // Convert request path string to array
        const reqPath = R.compose(
          R.reject(R.isEmpty),
          R.split('/'),
          R.replace(/self/, app.selfId),
          R.replace(/\/$/, ''),
          R.replace(apiPathPrefix, ''),
          String,
          R.prop('path')
        )(req)


        // SSE event publisher
        const send = R.compose(
          s => res.write(s), // ::res.write
          R.concat(R.__, '\n\n'),
          R.join('\n'),
          R.map(R.join(':')),
          R.toPairs,
          R.reject(R.isNil),
          R.over(R.lensProp('data'), JSON.stringify),
        )

        // Send keepalive
        const keepalive = setInterval(
          () => send({ event: 'keep-alive' }),
          20000
        )

        // Convert delta path to array
        const getPath = R.compose(
          R.append('value'),
          R.unnest,
          R.map(R.split('.')),
          R.pair
        )

        // Send delta
        const onDelta = ({ context, updates }) =>
          R.map(
            R.compose(
              send, // Send message
              R.assoc('data', R.__, {}), // Format message
              R.path(reqPath), // Only send data user is subscribed to
              R.reduce(
                // Turn event into a JSON patch
                (acc, { path, value }) =>
                  R.assocPath(getPath(context, path), value, acc),
                {}
              ),
              R.prop('values')
            ),
            updates
          )

        // Activate listener
        app.signalk.on('delta', onDelta)

        // Cleanup on disconnect
        res.on('close', () => {
          app.signalk.removeListener('delta', onDelta)
          clearTimeout(keepalive)
          debug('client disconnected')
        })

        // Send initial data
        return R.compose(
          send,
          R.assoc('data', R.__, {}),
          R.path(reqPath)
        )(app.signalk.retrieve())
      })
    },

    stop: function () {
      active = false
      // TODO: Disconnect existing connections
      debug('stopped')
    }
  }
}
