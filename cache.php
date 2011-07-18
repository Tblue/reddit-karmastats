<?php
/**
 * A cache for JSON data. Usually queried using AJAX.
 *
 * Uses APC to reduce I/O.
 *
 * HTTP GET retrieves data, POST stores it.
 *
 * To retrieve data:
 * Send a HTTP GET request with the following parameters:
 *   - nonce (see below)
 *   - key
 *
 * To store data:
 * Send a HTTP POST request with the following parameters:
 *   - nonce (see below)
 *   - key
 *   - data: A query string that will be parsed with parse_str() and transformed
 *           into JSON which is returned on a HTTP GET.
 *
 * About nonces:
 * The passed nonce is compared with the value of $_SESSION['nonce']. If they
 * don't match, the request is denied.
 *
 * Errors:
 * On an error, the HTTP status code and message is modified. The returned
 * JSON object has two keys, error (int; status code) and message (string).
 *
 * @author Tilman Blumenbach <tilman@ax86.net>
 * @copyright Copright (c) 2011, Tilman Blumenbach <tilman@ax86.net>
 * @license http://opensource.org/licenses/BSD-3-Clause BSD 3-clause license
 *
 * {@internal
 * Copyright (c) 2011, Tilman Blumenbach
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * - Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 * - Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 * - Neither the name of the author nor the names of the contributors may
 *   be used to endorse or promote products derived from this software
 *   without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 * }}
 */

/**
 * Path of cache dir.
 */
define( 'CACHEDIR', dirname( __FILE__ ).'/cache' );

/**
 * Octal mode to use for newly created hash dirs.
 */
define( 'CACHEDIR_MODE', 0755 );

/**
 * Depth of cache dir, i. e. how many levels of hash dirs to create.
 */
define( 'CACHEDIR_DEPTH', 2 );

/**
 * After how many seconds is a cache entry considered to be expired?
 */
define( 'CACHEDIR_TTL', 60 * 60 * 24 ); // 1 day

/**
 * Prefix to use for APC keys.
 */
define( 'CACHE_APC_PREFIX', 'ajaxcache_' );

/**
 * PHP session name to use.
 */
define( 'CACHE_PHP_SESSNAME', 'karmastats_session' );


/**
 * Create all subdirectories of the cache directory if necessary.
 *
 * @param string|NULL Directory to create cache dirs in. Used internally.
 * @param integer Current cache dir level. Used internally.
 * @return boolean false if a subdirectory could not be created. True otherwise.
 */
function create_cachedirs( $dir = NULL, $level = 0 )
{
    if( $level >= CACHEDIR_DEPTH )
    {
        return true;
    }

    if( $dir === NULL )
    {
        $dir = CACHEDIR;
    }

    $ret = true;
    foreach( array_merge( range( 0, 9 ), range( 'a', 'f' ) ) as $h )
    {
        $subdir = $dir.'/'.$h;
        if( ! file_exists( $subdir ) && ! @mkdir( $subdir, CACHEDIR_MODE ) )
        {
            return false;
        }

        $ret = create_cachedirs( $subdir, $level + 1 );
    }

    return $ret;
}

/**
 * Get the cache path for a filename.
 *
 * @param string The file name.
 * @return string The cache path for $filename.
 */
function file_get_cachepath( $filename )
{
    $h = sha1( $filename );
    $path = CACHEDIR;

    for( $i = 0; $i < CACHEDIR_DEPTH; $i++ )
    {
        $path .= '/'.$h[$i];
    }

    $path .= '/'.$h;
    return $path;
}

/**
 * Die with an error.
 *
 * Encodes error information into a JSON object. Keys:
 *   - error (int): $code
 *   - message (string): $msg
 *
 * Also modifies the HTTP status code.
 *
 * @param integer Error code
 * @param string Error message
 */
function error_die( $code, $msg )
{
    header( 'HTTP/1.0 '.$code.' '.preg_replace( '/[\r\n]+/', ' ', $msg ), true, $code );

    die( json_encode( array(
        'error' => (int)$code,
        'message' => (string)$msg,
    ) ) );
}

/**
 * Check if the passed nonce matches that one in the user's session and
 * error_die() if it doesn't.
 *
 * @param string The passed nonce.
 */
function assert_nonce_valid( $nonce )
{
    if( $nonce === '' || ! isset( $_SESSION['nonce'] ) || $_SESSION['nonce'] != $nonce )
    {
        error_die( 403, 'No or invalid nonce.' );
    }
}


session_name( CACHE_PHP_SESSNAME );
session_start();

if( ! create_cachedirs( CACHEDIR ) )
{
    error_die( 500, 'create_cachedirs() failed.' );
}

switch( strtoupper( $_SERVER['REQUEST_METHOD'] ) )
{
    case 'GET':
        assert_nonce_valid( isset( $_GET['nonce'] ) ? $_GET['nonce'] : '' );

        $key = isset( $_GET['key'] ) ? trim( $_GET['key'] ) : '';

        if( $key === '' )
        {
            error_die( 400, 'No key given.' );
        }

        // Try APC first.
        $data = apc_fetch( CACHE_APC_PREFIX.$key, $ok );

        if( $ok )
        {   // That's it.
            echo $data;
            exit;
        }

        // Try to look up the key in the cache.
        $file = file_get_cachepath( $key );

        if( ! file_exists( $file ) )
        {
            error_die( 404, 'Key does not exist in cache.' );
        }
        else if( ( $mtime = @filemtime( $file ) ) === false )
        {
            error_die( 500, 'filemtime() failed' );
        }
        else if( $mtime < time() - CACHEDIR_TTL )
        {
            @unlink( $file );
            error_die( 404, 'Key expired.' );
        }
        else if( ( $data = @file_get_contents( $file ) ) === false )
        {
            error_die( 500, 'file_get_contents() failed.' );
        }

        // Add data to APC:
        apc_store( CACHE_APC_PREFIX.$key, $data, CACHEDIR_TTL );

        echo $data;
        exit;

    // TODO: Fail if key exists?
    case 'POST':
        assert_nonce_valid( isset( $_POST['nonce'] ) ? $_POST['nonce'] : '' );

        $key = isset( $_POST['key'] ) ? trim( $_POST['key'] ) : '';
        if( $key === '' )
        {
            error_die( 400, 'No key given.' );
        }

        $data = isset( $_POST['data'] ) ? $_POST['data'] : '';
        if( $data === '' )
        {
            error_die( 400, 'No data given.' );
        }

        // Parse it into JSON:
        parse_str( $data, $data_arr );
        $json = json_encode( $data_arr );

        // TODO: Retry if locked?
        if( @file_put_contents( file_get_cachepath( $key ), $json, LOCK_EX ) === false )
        {
            error_die( 500, 'file_put_contents() failed.' );
        }

        // Add data to APC:
        apc_store( CACHE_APC_PREFIX.$key, $json, CACHEDIR_TTL );

        error_die( 200, 'OK' );

    default:
        error_die( 400, 'Unsupported request method.' );
}
