<?php
/**
 * Secret token to use when creating nonces.
 */
define( 'KARMASTATS_NONCETOKEN', '3fLfFL11aogeGgcglHemMn22Z2G4KfW4lpL3aPoHijg6Ufy2UpfsXhpzfZiY6gDR' );

/**
 * PHP session name to use.
 */
define( 'KARMASTATS_SESSNAME', 'karmastats_session' );

session_name( KARMASTATS_SESSNAME );
session_start();

$_SESSION['nonce'] = sha1( KARMASTATS_NONCETOKEN.'<:>'.microtime().'<:>'.$_SERVER['REMOTE_ADDR'].'<:>'.
                            ( isset( $_SERVER['HTTP_USER_AGENT'] ) ? $_SERVER['HTTP_USER_AGENT'] : 'lynx' ) );
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"
    "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Reddit Karma Statistics</title>

    <link rel="stylesheet" type="text/css" href="style.css">

    <script type="text/javascript">
        var karmastats_nonce = '<?php echo $_SESSION['nonce']; ?>';
    </script>
    <script type="text/javascript" src="karmastats.min.js"></script>

    <!-- Load Google Loader API. API key is for http://reddit.dataoverload.de/ -->
    <script type="text/javascript"
        src="https://www.google.com/jsapi?key=ABQIAAAAptCMwMIeC2mK9J9cna_pZBSH7bG8KYzbi5yUVhvXDw4vxB8t6hSSBva7c84bwZszWsGpvW7-2Md83w">
    </script>
    <script type="text/javascript">
        // Load Google Visualization API w/ new Pie Chart
        google.load( 'visualization', '1', { packages: ['corechart'] } );
        google.load( 'jquery', '1.6.2' );

        google.setOnLoadCallback( function()
            {
                $( new KarmaStats() );
            } );
    </script>
</head>
<body>
    <h1>Reddit Karma Statistics</h1>

    <div id="intro">
        <p>
            Ever wanted to know which subreddits contributed the most to your
            <a href="http://www.reddit.com">reddit</a>&trade; karma&reg;?
        </p>
        <p>
            This little web service analyzes your reddit history and breaks
            down your karma score into the subreddits that eventually make it
            up. It then generates nice, interactive pie charts for your pleasure.
        </p>
    </div>

    <div id="notes">
        <h2>Notes</h2>
        <ul>
            <li>Only publicly visible comments and submissions are counted.</li>
            <li>
                To generate the charts, we need to fetch all of your public comments
                and submissions. We can fetch 100 of them at once, so we need to make
                multiple requests. In order to not kill reddit's server <em>too</em> fast,
                there is a delay of two seconds between each request; this slows things down
                quite a bit. Sorry for that.
            </li>
            <li>
                The calculated karma displayed here may differ significantly from your official
                reddit karma, especially for users with a high karma score. This may be caused
                by reddit's
                <a href="http://www.reddit.com/help/faq#Howisasubmissionsscoredetermined">score fuzzing system</a>.
                Additionally, we can only fetch your last 1000 comments and submissions (this
                is a reddit limitation). Don't worry, though, even if the numbers don't match
                up exactly, the proportions should still be correct in most cases.
            </li>
            <li>
                The charts are cached for 24 hours. This is another measure to avoid frying the
                reddit servers too soon.
            </li>
        </ul>
    </div>

    <noscript>
        <p class="error">
            Sorry, you need JavaScript to use this fancy Web 2.0 service.
        </p>
    </noscript>

    <div id="interface">
        <form action="" id="karmaform">
            <p>
                Enter your reddit username to start (case does not matter):&nbsp;
                <input type="text" id="username">&nbsp;
                <input type="submit" id="submit_btn" value="Analyze me!">&nbsp;
                <span id="formerror" class="message error"></span>
            </p>
        </form>

        <div id="result" class="center"></div>
        <div id="sharelink" class="center"></div>
    </div>

    <div id="footer" class="center">
        <p>
            Brought to you by <a href="http://www.reddit.com/user/Tblue">Tblue</a>.
            Hosted by <a href="http://www.ax86.net">ax86.net weblog</a>.
        </p>
    </div>
</body>
</html>
