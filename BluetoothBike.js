function parseCycleRate(data) {
    const flags = data.getUint8(0);
    const wheelRevolutionBit = flags & 0x1 === 0;
    const crankRevolutionBit = (flags & (0x1 << 1)) === (0x1 << 1);
    const result = {};
    if (wheelRevolutionBit && crankRevolutionBit) {
        result.wheelRevolutions = data.getUint32(1, true);
        result.timesteps = data.getUint16(5);
        result.crankRevolutions = data.getUint16(7, true);
        result.timesteps = data.getUint16(9);
    }

    if (wheelRevolutionBit && !crankRevolutionBit) {
        result.wheelRevolutions = data.getUint32(1, true);
        result.timesteps = data.getUint16(5);
    }

    if (!wheelRevolutionBit && crankRevolutionBit) {
        result.crankRevolutions = data.getUint16(1, true);
        result.timesteps = data.getUint16(3, true);
    }
    return result;
}

async function BluetoothCSCMeasurement() {
    if ((await navigator.bluetooth.getAvailability()) === true) {
        // from https://github.com/WebBluetoothCG/registries/blob/master/gatt_assigned_services.txt
        let device = await navigator.bluetooth.requestDevice({
            filters: [{
                services: ["cycling_speed_and_cadence"]
            }]
        });
        await device.gatt.connect();
        let service = await device.gatt.getPrimaryService("cycling_speed_and_cadence");
        device.addEventListener('gattserverdisconnected',BluetoothCSCMeasurement);
        let cycling_measurement = await service.getCharacteristic('csc_measurement');
        let cycling_measurement_char = await cycling_measurement.startNotifications();
        let last_measurement = null;
        cycling_measurement_char.addEventListener('characteristicvaluechanged', function(event) {
            const characteristic = event.target;
            const measurement = parseCycleRate(characteristic.value);
            if (last_measurement && measurement.crankRevolutions) {
                var crank_rps = (measurement.crankRevolutions - last_measurement.crankRevolutions) / ((measurement.timesteps - last_measurement.timesteps) / 1024);
                var crank_rpm = crank_rps * 60;
            }

            if (last_measurement && measurement.wheelRevolutions) {
                var wheel_rps = (measurement.wheelRevolutions - last_measurement.wheelRevolutions) / ((measurement.timesteps - last_measurement.timesteps) / 1024);
                var wheel_rpm = wheel_rps * 60;
            }
            last_measurement = measurement;
            var csc_measurement_event = new CustomEvent('onCSCMesurement',{
                bubbles: true,

                detail: {
                    crank_rps,
                    crank_rpm,
                    wheel_rps,
                    wheel_rpm,
                    measurement,
                    last_measurement
                }
            });

            window.dispatchEvent(csc_measurement_event);
        });

    }
}

function handleCadenceChange(e) {
    const {crank_rpm} = e.detail;
    for (const videoElm of document.getElementsByTagName("video")){
        if (crank_rpm > 50) {
            videoElm.play();
            if (crank_rpm > 70) {
                videoElm.playbackRate = crank_rpm / 60;
            }
        } else {
            videoElm.pause();
        }
    }
    
}
window.addEventListener('onCSCMesurement', handleCadenceChange);

BluetoothCSCMeasurement();
