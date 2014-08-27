# Style Doc

A style guide generator designed for CSS/SASS/LESS.

# Install

```
npm install -g style-doc
```

# Usage

## What documentation get processed

Style doc works by parsing doc block comments.  It will process any blocks that starts with a `/**`, so this:

```css
/**
 * @section 1
 * @title Buttons
 *
 * This will be the description
 */
```

would be precessed but this:

```css
/*
 * @section 1
 * @title Buttons
 *
 * This will be the description
 */
```

would not.

More documentation to come later.  Take a look at the test folder which has example doc blocks that are parsed.

# License

MIT
