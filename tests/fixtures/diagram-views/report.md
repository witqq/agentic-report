---
title: Diagram audit
language: en
layout: document
---

# Diagram audit

::::::section{title="Flow auto" id="auto"}
:::diagram{title="Order flow" description="An order passes checkout, payment and fulfilment." layout="auto"}
::group{id="shop" label="Storefront"}
::group{id="back" label="Back office"}
::node{id="cart" label="Cart" group="shop" kind="accent"}
::node{id="checkout" label="Checkout" detail="Validates address" group="shop"}
::node{id="pay" label="Payment service" group="back" kind="warning"}
::node{id="ship" label="Fulfilment" group="back" kind="success"}
::node{id="mail" label="Notifications"}
::edge{from="cart" to="checkout" label="submit"}
::edge{from="checkout" to="pay" label="charge" kind="call"}
::edge{from="pay" to="ship" label="paid" kind="event"}
::edge{from="ship" to="mail" label="shipped" kind="data"}
::edge{from="pay" to="checkout" label="declined" kind="event"}
::edge{from="mail" to="cart" kind="dependency"}
:::
::::::

::::::section{title="Flow down" id="down"}
:::diagram{title="Build pipeline" description="Source is compiled, tested and published." layout="down"}
::node{id="src" label="Source"}
::node{id="compile" label="Compile" kind="accent"}
::node{id="test" label="Test"}
::node{id="lint" label="Lint"}
::node{id="pub" label="Publish" kind="success"}
::edge{from="src" to="compile"}
::edge{from="compile" to="test" kind="data"}
::edge{from="compile" to="lint" kind="data"}
::edge{from="test" to="pub" kind="dependency"}
::edge{from="lint" to="pub" kind="dependency"}
:::
::::::

::::::section{title="Flow right" id="right"}
:::diagram{title="Request path" description="A request goes from browser to database and back." layout="right"}
::node{id="b" label="Browser"}
::node{id="edge" label="Edge cache"}
::node{id="api" label="API" kind="accent"}
::node{id="db" label="Database"}
::edge{from="b" to="edge" label="GET"}
::edge{from="edge" to="api" label="miss"}
::edge{from="api" to="db" label="query" kind="data"}
::legend{title="Key"}
::legend-item{edge="data" label="Reads"}
::legend-item{node="accent" label="Owned by us"}
:::
::::::

::::::section{title="Flow orthogonal" id="ortho"}
:::diagram{title="Services" description="Services and their dependencies drawn with right angles." layout="orthogonal"}
::group{id="core" label="Core"}
::node{id="a" label="Gateway" group="core" kind="accent"}
::node{id="b" label="Accounts" group="core"}
::node{id="c" label="Billing" group="core"}
::node{id="d" label="Search"}
::node{id="e" label="Analytics" kind="warning"}
::edge{from="a" to="b"}
::edge{from="a" to="c"}
::edge{from="a" to="d" kind="data"}
::edge{from="b" to="e" kind="event"}
::edge{from="c" to="e" kind="event"}
::edge{from="d" to="e" kind="data"}
:::
::::::

::::::section{title="Sequence" id="seq"}
:::diagram{title="Login" description="A user signs in through the identity provider." type="sequence"}
::node{id="user" label="User"}
::node{id="app" label="App"}
::node{id="idp" label="Identity provider" kind="accent"}
::edge{from="user" to="app" label="open"}
::edge{from="app" to="idp" label="redirect" kind="call"}
::edge{from="idp" to="idp" label="check password"}
::edge{from="idp" to="app" label="token" kind="data"}
::edge{from="app" to="user" label="welcome" kind="event"}
:::
::::::
