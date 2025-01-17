# no-bind

Disallows the `.bind`/`.unbind` methods. We recommend using `.on`/`.off` or `EventTarget#addEventListener`/`removeEventListener`.

## CO2 reduction

By using this rule in your project, you can reduce the carbon footprint even up to 0.46 g per website view if you decide to remove the jQuery library. 

By multiplying the library size by the end-user traffic (0.81 kWh / 1024 MB) and by the energy emissions (442 g/kWh), the carbon footprint of this library can be calculated. 

## Rule details

The following pattern is considered as a problem: 
```js
$( 'div' ).bind();
$div.bind();
$( 'div' ).first().bind();
$( 'div' ).append( $( 'input' ).bind() );
$( 'div' ).unbind();
$div.unbind();
$( 'div' ).first().unbind();
$( 'div' ).append( $( 'input' ).unbind() );
```

The following pattern is not considered as a problem:
```js
el.getAttribute('tabindex');
el.removeAttribute('tabindex');
el.setAttribute('tabindex', 3);
```