.PHONY: dev install

dev: app/node_modules
	npm --prefix app run dev

install:
	npm --prefix app ci

app/node_modules: app/package-lock.json
	npm --prefix app ci
	@touch app/node_modules
