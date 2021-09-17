'use strict';

const generatedIDs = new Set();

const UniqueID = require('../lib/unique_id');

let sessionID = new UniqueID({ /*unique_interval: 365 * 24 * 3600,*/unique_interval: 60, node: true, radix: 64 });

function generate()
{
  let ids = 0;
  let id;
  let start = process.hrtime();

  for( let i = 0; i < 10000; ++i )
  {
    id = sessionID.get();

    ++ids;

    //console.log(id);


    /*if( !generatedIDs.has( id ) )
    {
      generatedIDs.add( id );
    }
    else
    {
      console.error( 'Duplicate', id );
    }*/
  }

  let elapsed = process.hrtime(start);
  
  console.log( ids + ' ids' );
  console.log( ( ids / ( elapsed[0] + elapsed[1] / 1e9 ) ) + ' ids / sec' );

  //process.exit();

  setTimeout( generate, 1000 );
}

setTimeout( generate, 1000 );

//setInterval( generate, 1000 );

console.log( UniqueID.UUIDv4() ); process.exit();