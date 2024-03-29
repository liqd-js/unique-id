'use strict';

// TODO: XOR time by machine_id:pid

const Options = require('@liqd-js/options');
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

let START_TIMESTAMP = Date.now(), START_HRTIME = process.hrtime(), CURRENT_TIME, MACHINE_ID;

function getBinary( number, length )
{
    return ('0'.repeat( length ) + number.toString(2)).substr(-length);
}

function hash32( data )
{
    const sha1 = require('crypto').createHash('sha1');
    sha1.update( data );

    return parseInt( sha1.digest('hex').substr(0, 8), 16 );
}

function toBase( number, radix )
{
    if( radix != 10 )
    {
        if( radix <= 36 )
        {
            number = number.toString( radix );
        }
        else if( radix <= 64 )
        {
            let value = number; number = '';

            do
            { 
                number = ALPHABET.charAt( value % radix ) + number;
                value = Math.floor( value / radix );
            }
            while( value > 0 );
        }
    }

    return number;
}

const B2H = [];

function UUIDtoStr( uuid )
{
    if( B2H.length === 0 )
    {
        for( let i = 0; i < 256; ++i )
        {
            B2H.push(( i + 0x100 ).toString(16).substr(1));
        }
    }

    return B2H[uuid[0]] + B2H[uuid[1]] + B2H[uuid[2]] + B2H[uuid[3]] + '-' + B2H[uuid[4]] + B2H[uuid[5]] + '-' + B2H[uuid[6]] + B2H[uuid[7]] + '-' + B2H[uuid[8]] + B2H[uuid[9]] + '-' + B2H[uuid[10]] + B2H[uuid[11]] + B2H[uuid[12]] + B2H[uuid[13]] + B2H[uuid[14]] + B2H[uuid[15]];
}

function UUIDFromStr( uuid )
{
    return Buffer.from( uuid.replace(/\-/g,''), 'hex' );
}

const UniqueID = module.exports = class UniqueID
{
    constructor( options = {} )
    {
        this._options = Options( options,
        {
            prefix            : { _required: false, _default: undefined },
            min               : { _required: false, _type: 'number', _default: 0 },
            max               : { _required: false, _type: 'number', _default: Number.MAX_SAFE_INTEGER },
            unique_interval   : { _required: false, _type: 'number', _default: 86400 },
            node              : { _required: false, _type: [ 'boolean', 'number', 'string' ], _default: true },
            pid               : { _required: false, _type: [ 'boolean', 'number', 'string' ], _default: true },
            radix             : { _required: false, _type: 'number', _default: 10 }
        });

        this._generator =
        {
            prefix      : this._options.prefix,
            min         : this._options.min,
            max         : this._options.max,
            id          : { bits: Math.floor( Math.log2( this._options.max - this._options.min )), max: 0 },
            timestamp   : { bits: Math.ceil( Math.log2( this._options.unique_interval )), max: 0, offset: 0 },
            node        : { bits: 0, max: 0, offset: 0, value: this._options.node !== true ? this._options.node : MACHINE_ID },
            pid         : { bits: 0, max: 0, offset: 0, value: this._options.pid !== true ? this._options.pid : process.pid },
            iterator    : { bits: 0, max: 0, value: 0 }
        };

        if( Math.ceil(( this._generator.id.bits - this._generator.timestamp.bits ) * 2 / 5 ) < 8 )
        {
            throw 'Error: small range for generator uniqueness, increase min/max or lower the unique interval';
        }

        this._generator.id.max = Math.pow( 2, this._generator.id.bits );
        this._generator.timestamp.max = Math.pow( 2, this._generator.timestamp.bits );
        this._generator.timestamp.offset = Math.pow( 2, this._generator.id.bits - this._generator.timestamp.bits );

        let instance_bits = 0;

        if( this._options.node === false && this._options.pid === false )
        {
            this._generator.iterator.bits = this._generator.id.bits - this._generator.timestamp.bits;
        }
        else if( this._options.node === false || this._options.pid === false )
        {
            this._generator.iterator.bits = Math.ceil(( this._generator.id.bits - this._generator.timestamp.bits ) * 3 / 5 );
            instance_bits = Math.ceil(( this._generator.id.bits - this._generator.timestamp.bits - this._generator.iterator.bits ) * 3 / 5 );
            instance_bits += Math.floor( instance_bits / 3 );
            this._generator.iterator.bits = this._generator.id.bits - this._generator.timestamp.bits - instance_bits;
        }
        else
        {
            this._generator.iterator.bits = Math.ceil(( this._generator.id.bits - this._generator.timestamp.bits ) * 3 / 5 );
            instance_bits = Math.ceil(( this._generator.id.bits - this._generator.timestamp.bits - this._generator.iterator.bits ) * 3 / 5 );
        }

        if( this._options.node !== false )
        {
            this._generator.node.bits = instance_bits;
            this._generator.node.max = Math.pow( 2, this._generator.node.bits );
            this._generator.node.offset = Math.pow( 2, this._generator.id.bits - this._generator.timestamp.bits - this._generator.node.bits );

            if( this._options.node === true && MACHINE_ID === undefined )
            {
                this._generator.node.value = Math.floor( Math.random() * Math.pow( 2, this._generator.node.bits ));
                this._generator.node.value *= this._generator.node.offset;

                require('./machine_id')().then( id =>
                {
                    this._generator.node.value = ( MACHINE_ID = id ? hash32( id ) : Math.floor( Math.random() * Math.pow( 2, 32 ))) % Math.pow( 2, this._generator.node.bits );
                    this._generator.node.value *= this._generator.node.offset;
                });
            }
            else
            {
                this._generator.node.value = ( typeof this._generator.node.value === 'number' ? this._generator.node.value : hash32( this._generator.node.value )) % Math.pow( 2, this._generator.node.bits );
                this._generator.node.value *= this._generator.node.offset;
            }
        }
        else
        {
            this._generator.node.value = 0;
        }

        if( this._options.pid !== false )
        {
            this._generator.pid.bits =  instance_bits;
            this._generator.pid.max = Math.pow( 2, this._generator.pid.bits );
            this._generator.pid.offset = Math.pow( 2, this._generator.iterator.bits );
            this._generator.pid.value = ( typeof this._generator.pid.value === 'number' ? this._generator.pid.value : hash32( this._generator.pid.value )) % Math.pow( 2, this._generator.pid.bits );
            this._generator.pid.value *= this._generator.pid.offset;
        }
        else
        {
            this._generator.pid.value = 0;
        }

        this._generator.iterator.max = Math.pow( 2, this._generator.iterator.bits );
        this._generator.iterator.value = Math.floor( Math.random() * this._generator.iterator.max );
    }

    info()
    {
      let info = JSON.parse( JSON.stringify( this._generator ));

      info.mask =
      {
          'id       ' : getBinary( this._generator.id.max - 1, this._generator.id.bits ),
          'time     ' : getBinary(( this._generator.timestamp.max - 1 ) * this._generator.timestamp.offset, this._generator.id.bits ),
          'node     ' : getBinary(( this._generator.node.max - 1 ) * this._generator.node.offset, this._generator.id.bits ),
          'pid      ' : getBinary(( this._generator.pid.max - 1 ) * this._generator.pid.offset, this._generator.id.bits ),
          'iterator ' : getBinary( this._generator.iterator.max - 1, this._generator.id.bits )
      }

      return info;
    }

    get()
    {
        if( CURRENT_TIME === undefined )
        {
            let elapsed = process.hrtime( START_HRTIME );

            CURRENT_TIME = Math.floor( START_TIMESTAMP / 1000 + elapsed[0] + elapsed[1] / 1e9 );

            setImmediate(() => { CURRENT_TIME = undefined });
        }

        let id = toBase(
            (( CURRENT_TIME % this._generator.timestamp.max ) * this._generator.timestamp.offset ) +
            this._generator.node.value + this._generator.pid.value +
            ( this._generator.iterator.value = ( this._generator.iterator.value + 1 ) % this._generator.iterator.max ) +
            this._generator.min
        , this._options.radix );

        return ( this._options.prefix ? this._options.prefix + id : id );
    }

    static UUID( uuid, format, input_format )
    {
        if( typeof uuid === 'string' )
        {
            if([ 'base64', 'hex' ].includes( input_format ))
            {
                uuid = Buffer.from( uuid, input_format );
            }
            else if( input_format === 'base64url' )
            {
                uuid = Buffer.from( uuid.replace(/\-/g,'+').replace(/_/g,'/'), 'base64' );
            }
            else
            {
                uuid = UUIDFromStr( uuid );
            }
        }

        if([ 'base64', 'hex' ].includes( format ))
        {
            return uuid.toString( format );
        }
        else if( format === 'base64url' )
        {
            return uuid.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
        }

        return UUIDtoStr( uuid );
    }

    static UUIDv4( format )
    {
        const rnd = Buffer.alloc( 16 );
        require('crypto').randomFillSync( rnd );

        rnd[6] = ( rnd[6] & 0x0f ) | 0x40;
        rnd[8] = ( rnd[8] & 0x3f ) | 0x80;

        return UniqueID.UUID( rnd, format );
    }
}
