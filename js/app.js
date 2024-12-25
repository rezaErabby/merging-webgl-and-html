import * as THREE from 'three';
import imagesLoaded from 'imagesloaded';
import FontFaceObserver from 'fontfaceobserver';
import fragment from "./shaders/fragment.glsl";
import vertex from "./shaders/vertex.glsl";
import imageTexture from '../img/1.jpg';
import Scroll from './scroll';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import noise from './shaders/noise.glsl'


export default class Sketch{
    constructor(options){
        this.time = 0;
        this.container = options.dom
        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera( 
            70, 
            this.width / this.height, 
            100, 
            2000 );

        this.camera.position.z = 600

        this.camera.fov = 2*Math.atan((this.height/2)/600) * (180/Math.PI)

        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
        this.renderer.setSize(this.width, this.height );
        this.container.appendChild( this.renderer.domElement );

        // this.controls = new OrbitControls( this.camera, this.renderer.domElement );

        this.images = [...document.querySelectorAll('img')]

        const fontOpen = new Promise(resolve => {
            new FontFaceObserver("Open Sans").load().then(() => {
                resolve()
            })
        })
        const fontPlayFair = new Promise(resolve => {
            new FontFaceObserver("Playfair Display").load().then(() => {
                resolve()
            })
        })

        // preload images 
        const preloadImages = new Promise((resolve, reject) => {
            imagesLoaded(
                document.querySelectorAll('img'), 
                { background: true },
                resolve
            )
        })

        let allDone = [fontOpen, fontPlayFair, preloadImages]

        this.currentScroll = 0;

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        Promise.all(allDone).then( () => {
            this.scroll = new Scroll()
            this.addImage()
            this.setPosition()
            this.pointerMovement()
            this.resize()
            this.setupResize()
            // this.addObjects()
            this.composerPass()
            this.render()

            // window.addEventListener('scroll', ()=> {
            //     this.currentScroll = window.scrollY;
            //     // console.log(this.currentScroll)
            //     this.setPosition()
            // })
        })

    }

    addImage(){
        this.material = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            fragmentShader: fragment,
            vertexShader: vertex,
            // wireframe: true,
            uniforms: {
                time: { value : 0 },
                uImage: {value: 0 },
                hoverState: {value: 0 },
                hover: { value: new THREE.Vector2(0.5,0.5)},
                imageTexture: {value : new THREE.TextureLoader().load(imageTexture)}
            }
         })
        
         this.materials = []

        this.imageStore = this.images.map(image => {
            let bounds = image.getBoundingClientRect()

            let geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, 10, 10)

            let texture = new THREE.Texture(image);
            texture.needsUpdate = true;
            // let material = new THREE.MeshBasicMaterial({
            //     // color: 0xff0000,
            //     map: texture
            // })
            let material = this.material.clone()

            material.uniforms.uImage.value = texture

            image.addEventListener('pointerenter', () => {
                gsap.to(material.uniforms.hoverState, {
                    duration: 1,
                    value: 1
                })
            })

            image.addEventListener('pointerout', () => {
                gsap.to(material.uniforms.hoverState, {
                    duration: 1,
                    value: 0
                })
            })

            this.materials.push(material)
            let mesh = new THREE.Mesh(geometry,material)

            this.scene.add(mesh)

            return {
                image: image,
                mesh: mesh,
                top: bounds.top,
                left: bounds.left,
                width: bounds.width,
                height: bounds.height
            }
        })
    }

    setPosition(){
        this.imageStore.forEach(o=>{
            
            o.mesh.position.y = this.currentScroll - o.top + this.height/2 - o.height/2;
            o.mesh.position.x = o.left - this.width/2 + o.width/2;
        })
    }

    pointerMovement(){
        window.addEventListener('pointermove', (event) => {
            this.pointer.x = ( event.clientX / this.width ) * 2 - 1;
            this.pointer.y = - ( event.clientY / this.height ) * 2 + 1;

            this.raycaster.setFromCamera( this.pointer, this.camera );

            const intersects = this.raycaster.intersectObjects( this.scene.children );

            if(intersects.length > 0){
                // console.log(intersects[0])
                let obj = intersects[0].object;

                obj.material.uniforms.hover.value = intersects[0].uv;
            }
        })
    }



    setupResize(){
        window.addEventListener('resize', this.resize.bind(this))
    }

    resize() {
        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;
        this.renderer.setSize(this.width, this.height);
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
    
        // Recalculate image bounds
        this.imageStore.forEach(o => {
            const bounds = o.image.getBoundingClientRect();
            o.top = bounds.top;
            o.left = bounds.left;
            o.width = bounds.width;
            o.height = bounds.height;
    
            // Update geometry to match new bounds
            o.mesh.geometry.dispose(); // Clean up old geometry
            o.mesh.geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, 10, 10);
        });
    
        this.setPosition(); // Update positions after resizing
    }
    


    composerPass(){
        this.composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
  
        //custom shader pass
        var counter = 0.0;
        this.myEffect = {
          uniforms: {
            "tDiffuse": { value: null },
            "scrollSpeed": { value: null },
            "time": { value: null },
          },
          vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix 
              * modelViewMatrix 
              * vec4( position, 1.0 );
          }
          `,
          fragmentShader: `
          uniform sampler2D tDiffuse;
          varying vec2 vUv;
          uniform float scrollSpeed;
          uniform float time;
          ${noise}

          void main(){
            vec2 newUV = vUv;
            float area = smoothstep(1.,0.6,vUv.y)*2. - 1.;
            // area = pow(area, 4.);
            float noise = 0.5 * (cnoise(vec3(vUv*10.,time)) + 1.);
            float n = smoothstep(0.5,0.5,noise + area);
            newUV.x -= (vUv.x - 0.5) * 0.1 * area * scrollSpeed;
            gl_FragColor =  texture2D(tDiffuse,newUV);
            gl_FragColor = mix(vec4(1.),texture2D( tDiffuse, newUV),n);
          }
          `
        }
  
        this.customPass = new ShaderPass(this.myEffect);
        this.customPass.renderToScreen = true;
  
        this.composer.addPass(this.customPass);
      }
      


    addObjects(){
         this.geometry = new THREE.PlaneGeometry(100,100,10,10);
        //  this.geometry = new THREE.SphereGeometry( 15, 32, 16 );
        //  this.material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
         this.material = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            fragmentShader: fragment,
            vertexShader: vertex,
            // wireframe: true,
            uniforms: {
                time: { value : 0 },
                imageTexture: {value : new THREE.TextureLoader().load(imageTexture)}
            }
         })
         this.cube = new THREE.Mesh( this.geometry, this.material );
        this.scene.add( this.cube );
    }


    render(){
        this.time += 0.05;

        this.scroll.render()
        this.currentScroll = this.scroll.scrollToRender;
        this.setPosition()
        // this.cube.rotation.x += 0.01;
        // this.cube.rotation.y += 0.01;
        this.customPass.uniforms.scrollSpeed.value = this.scroll.speedTarget
        this.customPass.uniforms.time.value = this.time;
        this.materials.forEach(material => {
            material.uniforms.time.value = this.time;
        })
    
        // this.renderer.render( this.scene, this.camera );
        this.composer.render()
        

        window.requestAnimationFrame(this.render.bind(this))
    }
}

new Sketch({
    dom: document.getElementById('container')
});