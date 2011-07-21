/**
 * @fileOverview KarmaStats breaks a user's reddit.com karma score down
 *               into the subreddits that make it up.
 *
 * @author Tilman Blumenbach <tilman@ax86.net>
 */
/* Copyright (c) 2011, Tilman Blumenbach
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
 */

/**
 * Creates a new KarmaStats object.
 *
 * Automatically starts processing if the URL contains a hash followed by
 * a user name.
 *
 * @class This class implements the whole KarmaStats functionality. It's
 *        not really reusable because that's not a requirement for the current
 *        use case. However, it should probably be (OOP principle). FIXME?
 */
var KarmaStats = function()
{
    $( '#interface' ).show();
    $( '#karmaform' ).submit( $.proxy( this, 'analyzeUser' ) );
    $( '#username' ).focus();

    if( document.location.hash !== '' )
    {
        var username = document.location.hash.substr( 1 );
        $( '#username' ).val( username );
        $( '#karmaform' ).submit();
    }
};

KarmaStats.prototype = {
    /**
     * How many datasets to fetch at once? 100 seems to be the upper limit
     * right now.
     *
     * @private
     */
    limit: 100,

    /**
     * URL of the cache controller.
     *
     * @private
     */
    cache_url: 'cache.php',

    /**
     * Prefix to use for cache keys.
     *
     * @private
     */
    cache_prefix: 'karmastats_',

    /**
     * The timeout ID for the timeout error handler.
     *
     * @type integer
     * @private
     * @see installErrorTimeoutHandler()
     * @see removeErrorTimeoutHandler()
     */
    errorTimeoutHandler: undefined,

    /**
     * The username of the user currently being processed.
     *
     * @type string
     * @private
     */
    username: undefined,

    /**
     * The base URL used for API requests.
     *
     * @type string
     * @private
     */
    url: undefined,

    /**
     * Number of datasets received for the current user.
     *
     * @private
     */
    count: 0,

    /**
     * Value to use for the "next" API parameter on the next call.
     *
     * null if all datasets have been received.
     *
     * @type string
     * @private
     */
    after: undefined,

    /**
     * Map mapping subreddits to their total karma count for this user.
     *
     * @private
     */
    all: {},

    /**
     * Map mapping subreddits to their comment karma count for this user.
     *
     * @private
     */
    comments: {},

    /**
     * Map mapping subreddits to their submission karma count for this user.
     *
     * @private
     */
    submissions: {},


    /**
     * Reset this object to its initial state.
     *
     * Used before processing a new user.
     *
     * @param boolean dataOnly Only reset data variables (all, comments, ...)? Optional, default: false
     * @private
     */
    reset: function( dataOnly )
    {
        this.count = 0;
        this.after = undefined;

        this.all = {};
        this.comments = {};
        this.submissions = {};

        if( typeof( dataOnly ) != 'undefined' && dataOnly )
        {
            return;
        }

        this.username = undefined;
        this.url = undefined;
    },

    /**
     * Show an error message to the user.
     *
     * @private
     * @param string error Error message
     * @param boolean onForm Show error next to input form (optional, defaults to false)?
     */
    showError: function( error, onForm )
    {
        if( typeof( onForm ) != 'undefined' && onForm )
        {   // Show error next to form
            $( '#username' ).addClass( 'errorfield' );
            $( '#formerror' ).html( error );
        }
        else
        {   // Show error in chart area
            $( '#result' ).html( '<div id="status"><p class="message error">' + error + '</p></div>' );
        }
    },

    /**
     * Clear the current error being displayed.
     *
     * @private
     * @param boolean onForm Clear error next to form (optional, defaults to false)?
     */
    clearError: function( onForm )
    {
        if( typeof( onForm ) != 'undefined' && onForm )
        {
            $( '#username' ).removeClass( 'errorfield' );
            $( '#formerror' ).empty();
        }
        else
        {
            $( '#result' ).empty();
        }
    },

    /**
     * Set the status message being displayed.
     *
     * @private
     * @param string status Status message
     * @param boolean isWarning Is this a warning (optional, defaults to false)?
     */
    setStatus: function( status, isWarning )
    {
        var css_class = typeof( isWarning ) != 'undefined' && isWarning ? 'warning' : 'status';
        $( '#result' ).html( '<div id="status"><img alt="Wait..." src="throbber.gif"><p class="message ' + css_class + '">' + status + '</p></div>' );
    },

    /**
     * Install the error timeout handler.
     *
     * Removes an existing error timeout handler if necessary.
     *
     * Used to display a warning to the user if we don't receive any data
     * in 5 seconds.
     *
     * @private
     * @see removeErrorTimeoutHandler()
     */
    installErrorTimeoutHandler: function()
    {
        this.removeErrorTimeoutHandler();
        this.errorTimeoutHandler = setTimeout( $.proxy( function()
            {
                this.setStatus( 'No data received yet! Maybe the user does not exist or ' +
                                'reddit is overloaded? We will keep on trying...', true );
            }, this ), 5000 );
    },

    /**
     * Remove the error timeout handler.
     *
     * @private
     * @returns boolean True if there was an error timeout handler to remove, false otherwise.
     * @see installErrorTimeoutHandler()
     */
    removeErrorTimeoutHandler: function()
    {
        if( this.errorTimeoutHandler == undefined )
        {
            return false;
        }

        clearTimeout( this.errorTimeoutHandler );
        return true;
    },

    /**
     * Analyze the user given in the "username" input field.
     *
     * @public
     * @returns boolean False. Prevents default form action (submitting).
     */
    analyzeUser: function()
    {
        this.clearError(); // Clear error in chart area
        this.clearError( true ); // Clear error on form
        $( '#sharelink' ).hide();
        this.reset();

        this.username = $.trim( $( '#username' ).val() ).toLowerCase();
        if( this.username === '' )
        {
            this.showError( 'Empty username. Try again.', true );
            return false;
        }

        // Update the hash to make it possible to simply share the URL:
        document.location.hash = '#' + escape( this.username );

        // Whoo, let's start!
        this.checkCache();

        return false; // prevent default form action (i. e. submitting the form)
    },

    /**
     * Check if there is cached data for the current user and call drawAllCharts()
     * directly if that is the case.
     *
     * @private
     */
    checkCache: function()
    {
        // Clear error timeout handler; it may still be set if the data for the
        // last user could not be fetched.
        this.removeErrorTimeoutHandler();

        this.setStatus( 'Checking cache...' );
        $.ajax( this.cache_url, {
            data: {
                key: this.cache_prefix + this.username,
                nonce: karmastats_nonce
            },
            dataType: 'json',
            context: this,
            error: function( jqXHR, textStatus, errorThrown )
                {   // No cached data or cache error.
                    //~ opera.postError( 'Cache error: ' + textStatus + ' ' + errorThrown );
                    this.gatherData();
                },
            success: function( data, textStatus, jqXHR )
                {   // We got some cached data, populate our internal variables.
                    //~ opera.postError( 'Got cached data: ' + textStatus );
                    try
                    {
                        this.all         = data.all;
                        this.comments    = data.comments;
                        this.submissions = data.submissions;
                    }
                    catch ( e )
                    {
                        if( typeof( e ) == 'object' && typeof( e.name ) != 'undefined' &&
                            e.name == 'TypeError' )
                        {   // Got invalid data from cache!
                            this.reset( true );
                            this.gatherData();
                            return;
                        }

                        // Unhandled exception
                        throw e;
                    }

                    // All good, draw charts.
                    this.drawAllCharts();
                }
        } );
    },

    /**
     * Retrieve and process datasets for the current user.
     *
     * @private
     */
    gatherData: function()
    {
        this.setStatus( 'Fetching datasets (got 0 so far)...' );
        this.url = 'http://www.reddit.com/user/' + escape( this.username ) + '/.json?sort=top&limit=' + this.limit;

        $.ajax( this.url, {
            dataType: 'jsonp',
            jsonp: 'jsonp',
            context: this,
            success: this.dataLoaded
        } );

        this.installErrorTimeoutHandler();
    },

    /**
     * Callback: Called by jQuery when there is new data to process.
     *
     * @private
     * @see <a href="http://api.jquery.com/jQuery.ajax/">jQuery.ajax(): success callback</a>
     */
    dataLoaded: function( reqData, textStatus, jqXHR )
    {
        this.removeErrorTimeoutHandler();

        // Catching TypeErrors here in order to easily detect when the
        // received data is invalid.
        try
        {
            var listing = reqData.data.children;
            this.after  = reqData.data.after;
            this.count += listing.length;

            for( k in listing )
            {
                var sub = listing[k];
                var basket;

                if( sub.kind == 't1' )
                {   // Comment
                    basket = this.comments;
                }
                else if( sub.kind == 't3' )
                {   // Submission
                    if( sub.data.is_self )
                    {   // Self posts do not count towards the total karma.
                        continue;
                    }

                    basket = this.submissions;
                }
                else
                {   // Unknown kind, ignore it.
                    continue;
                }

                if( typeof( sub.data.score ) == 'undefined' )
                {   // Calculate it.
                    sub.data.score = sub.data.ups - sub.data.downs;
                }

                if( ( sub.data.score == 0 && sub.data.ups == 0 ) ||
                    ( sub.data.score == 1 && sub.data.ups == 1 ) ||
                    ( sub.data.score == -1 && sub.data.downs == 1 ) )
                {   // Submission has been upvoted/downvoted by its author, or the
                    // author has removed his upvote/downvote. That doesn't count
                    // towards the total karma.
                    //~ opera.postError( 'Upvoted by user only: ' + ( sub.kind == 't1' ? sub.data.body : sub.data.title ) + ' (' + sub.data.ups + '/' + sub.data.downs + ')' );
                    continue;
                }

                //~ opera.postError( 'Kind: ' + sub.kind );
                //~ opera.postError( 'Data: ' + ( sub.kind == 't1' ? sub.data.body : sub.data.title ) );
                //~ opera.postError( 'Score: ' + sub.data.score + ' (' + sub.data.ups + '/' + sub.data.downs + ')' );
                //~ opera.postError( 'Subreddit: ' + sub.data.subreddit );

                if( typeof( basket[sub.data.subreddit] ) == 'undefined' )
                {
                    basket[sub.data.subreddit] = 0;
                }
                basket[sub.data.subreddit] += sub.data.score;

                if( typeof( this.all[sub.data.subreddit] ) == 'undefined' )
                {
                    this.all[sub.data.subreddit] = 0;
                }
                this.all[sub.data.subreddit] += sub.data.score;

                //~ opera.postError( '[' + ( sub.kind == 't1' ? 'C' : 'S' ) + '] ' + sub.data.subreddit + ': ' + sub.data.score + ' (=' + basket[sub.data.subreddit] + ')' );
            }
        }
        catch ( e )
        {
            // Would be great if I could use catch ( e if ... ), but I can't.
            // At least not in Opera 11.50. So let's make this ugly.
            if( typeof( e ) == 'object' && typeof( e.name ) != 'undefined' &&
                e.name == 'TypeError' )
            {
                this.showError( 'Received malformed data!' );
                return;
            }

            // Unhandled exception.
            throw e;
        }

        // And now let's fetch more data (if needed).
        if( this.after === null )
        {   // We are done!
            // Draw the charts:
            this.drawAllCharts();

            // Save data in cache:
            var data_to_send = $.param( {
                all: this.all,
                comments: this.comments,
                submissions: this.submissions
            } );

            $.ajax( this.cache_url, {
                type: 'POST',
                data: {
                    key: this.cache_prefix + this.username,
                    nonce: karmastats_nonce,
                    data: data_to_send
                },
                dataType: 'json',
                context: this /*,
                success: function( data, textStatus, jqXHR )
                    {
                        opera.postError( 'Data sent to cache.' );
                    },
                error: function( jqXHR, textStatus, errorThrown )
                    {
                        opera.postError( 'Could not cache data: ' + textStatus + ' ' + errorThrown );
                    }*/
            } );

            return;
        }

        // There's more data to fetch.
        this.setStatus( 'Fetching datasets (got ' + this.count + ' so far)...' );
        //~ opera.postError( '=== MORE (count: ' + this.count + ', after: ' + this.after +  ') ===' );

        // Wait 2 seconds between requests in order to not kill reddit's servers.
        // You are an evil person if you remove this delay.
        setTimeout( $.proxy( function()
            {
                $.ajax( this.url, {
                    data: {
                        count: this.count,
                        after: this.after
                    },
                    dataType: 'jsonp',
                    jsonp: 'jsonp',
                    context: this,
                    success: this.dataLoaded
                } );

                this.installErrorTimeoutHandler();
            }, this ), 2000 );
    },

    /**
     * Draw a karma breakdown chart from specific data.
     *
     * @private
     * @param object data The data to use. See e. g. {@link all}.
     * @param string baseTitle Base title to use. " (%d points)" gets appended.
     * @param integer Width of the chart.
     * @param integer Height of the chart.
     * @param elm DOM element to attach the chart to.
     */
    drawChart: function( data, baseTitle, width, height, elm )
    {
        var chart_data = new google.visualization.DataTable();

        chart_data.addColumn( 'string', 'Subreddit' );
        var sort_col = chart_data.addColumn( 'number', 'Karma' );

        var total = 0;
        for( s in data )
        {
            var label = s;
            // If received from the cache, the data values may not be Numbers,
            // but Strings. FIXME properly (in the cache?).
            var value = Number( data[s] );

            total += value;

            if( value < 0 )
            {
                value = -value;
                label += ' (negative)';
            }

            chart_data.addRow( [label, value] );
        }

        chart_data.sort( sort_col );

        var chart = new google.visualization.PieChart( elm );
        chart.draw( chart_data, {
            title: baseTitle + ' (' + total + ' points)',
            width: width,
            height: height,
            reverseCategories: true
        } );
    },

    /**
     * Draw all karma breakdown charts.
     *
     * @private
     */
    drawAllCharts: function()
    {
        this.setStatus( 'Generating charts...' );
        $( '#result' ).append( '<div id="charts" style="display: none;"><table>' +
            '<tr><td><div id="submissions"></div></td><td><div id="comments"></div></td></tr>' +
            '<tr><td colspan="2"><div id="all"></div></td></tr>' +
            '</table></div>' );

        if( window.innerWidth >= 1240 )
        {   // Let's display some slightly bigger charts.
            $( '#result' ).css( 'width', '1240px' );
            chart_width  = 620;
            chart_height = 420;
        }
        else
        {
            $( '#result' ).css( 'width', '1000px' );
            chart_width  = 500;
            chart_height = 300;
        }

        this.drawChart( this.submissions, 'Submission karma', chart_width, chart_height, document.getElementById( 'submissions' ) );
        this.drawChart( this.comments, 'Comment karma', chart_width, chart_height, document.getElementById( 'comments' ) );
        this.drawChart( this.all, 'Total karma', chart_width, chart_height, document.getElementById( 'all' ) );

        $( '#status' ).hide();
        $( '#charts' ).show();

        var myaddr = document.location.href.replace( /#.*$/, '' );
        myaddr += '#' + escape( this.username );
        $( '#sharelink' ).html( 'Want to share these statistics? Point your friends to ' +
                                '<a href="' + myaddr + '">' + myaddr + '</a>.' ).show();
    }
};
