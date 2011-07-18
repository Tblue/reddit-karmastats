#!/bin/sh
# Minfies the karmastats.js script using the Google Closure Compiler.

(
    cat <<EOF
// (c) 2011 by Tilman Blumenbach
// Licensed under the BSD 3-clause license: http://opensource.org/licenses/BSD-3-Clause
// For the full license and source code, see karmastats.js in this directory.
EOF
    closure --compilation_level SIMPLE_OPTIMIZATIONS --js karmastats.js
) > karmastats.min.js
