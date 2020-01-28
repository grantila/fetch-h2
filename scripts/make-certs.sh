#!/bin/sh

set -e

# Same as in the test and docker-compose (!)
DIR=/tmp/fetch-h2-certs

node_modules/.bin/rimraf ${DIR}
mkdir -p ${DIR}
node_modules/.bin/mkcert create-ca \
	--key ${DIR}/ca-key.pem --cert ${DIR}/ca.pem
node_modules/.bin/mkcert create-cert \
	--ca-key ${DIR}/ca-key.pem --ca-cert ${DIR}/ca.pem \
	--key ${DIR}/key.pem --cert ${DIR}/cert.pem \
	--domains localhost,127.0.0.1
