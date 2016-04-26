duang
----------

![duang!](./logo.png)

**duang** is a cli tool help to eliminate all your dependencies. 
Basically, it rename all the node_modules folder into `xnode_modules` and 
change the require statement to correspond to the `xnode_modules` path.

## Install

```
npm install duang -g
```

## Use

```
cd /path/to/your/project
duang --output out
```

You will see there is an `out` in which there is a `xnode_modules` folder lies.
Then you will notice every line of require under the `out` folder has been turned
into relative path.

## License

MIT
