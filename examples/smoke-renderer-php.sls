#!php
<?php

$service = 'nginx';
$enabled = true;

echo $enabled ? "enable {$service}\n" : "disable {$service}\n";